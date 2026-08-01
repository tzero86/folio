use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tracing::info;

/// Stream the native PDF to disk, reporting progress as `pct:100` so the
/// frontend's existing progress bar works unchanged.
async fn download_original_pdf<F>(
    client: &reqwest::Client,
    file_name: &str,
    identifier: &str,
    dest: &Path,
    cancel: Arc<AtomicBool>,
    emit_status: &F,
) -> Result<String>
where
    F: Fn(&str, Option<&str>),
{
    if cancel.load(Ordering::Relaxed) {
        anyhow::bail!("cancelled");
    }
    let url = format!("https://archive.org/download/{identifier}/{file_name}");
    let resp = client
        .get(&url)
        .header("Referer", "https://archive.org/")
        .send()
        .await?;
    if !resp.status().is_success() {
        anyhow::bail!("HTTP {} for {url}", resp.status());
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(dest).await?;
    let mut stream = resp.bytes_stream();
    let mut written: u64 = 0;
    let mut last_pct = 0u32;
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            anyhow::bail!("cancelled");
        }
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        written += chunk.len() as u64;
        if total > 0 {
            let pct = ((written * 100) / total) as u32;
            if pct >= last_pct + 5 || pct >= 100 {
                last_pct = pct;
                emit_status("downloading", Some(&format!("{pct}:100")));
            }
        }
    }
    file.flush().await?;
    Ok(dest.to_string_lossy().to_string())
}

pub async fn download_book<F>(
    client: &reqwest::Client,
    identifier: &str,
    output_dir: &Path,
    resolution: i32,
    create_pdf: bool,
    save_metadata: bool,
    cancel: Arc<AtomicBool>,
    emit_status: F,
) -> Result<String>
where
    F: Fn(&str, Option<&str>),
{
    if cancel.load(Ordering::Relaxed) {
        anyhow::bail!("cancelled");
    }
    info!("starting download for {}", identifier);
    emit_status("started", None);

    super::archive::loan_book(client, identifier).await?;
    let (title, links, metadata) = super::archive::get_book_infos(client, identifier).await?;
    info!("book {} has {} pages", identifier, links.len());

    // Fast path: when the user wants a PDF and the item has a native PDF,
    // download the original directly instead of rasterized page images.
    if create_pdf {
        match super::archive::find_original_pdf(client, identifier).await {
            Ok(Some(pdf_name)) => {
                let pdf_path = output_dir.join(format!("{title}.pdf"));
                info!("item {} has native PDF, downloading directly", identifier);
                match download_original_pdf(client, &pdf_name, identifier, &pdf_path, cancel.clone(), &emit_status).await {
                    Ok(path) => {
                        emit_status("done", Some(&path));
                        return Ok(path);
                    }
                    Err(e) => {
                        info!("native PDF download failed ({e}), falling back to image pipeline");
                    }
                }
            }
            Ok(None) => {}
            Err(e) => {
                info!("metadata lookup failed ({e}), falling back to image pipeline");
            }
        }
    }

    let dir = output_dir.join(&title);
    tokio::fs::create_dir_all(&dir).await?;

    if save_metadata {
        let meta_path = dir.join("metadata.json");
        let meta_json = serde_json::to_string_pretty(&metadata)?;
        tokio::fs::write(&meta_path, meta_json).await?;
    }

    let width = links.len().to_string().len();
    let total = links.len();
    let image_paths = Arc::new(tokio::sync::Mutex::new(Vec::with_capacity(total)));
    let semaphore = Arc::new(Semaphore::new(50));
    let mut handles = Vec::with_capacity(total);

    for (i, link) in links.iter().enumerate() {
        let url = format!("{link}&rotate=0&scale={resolution}");
        let path = dir.join(format!("{:0>width$}.jpg", i + 1));
        let c = client.clone();
        let id = identifier.to_string();
        let paths = image_paths.clone();
        let sem = semaphore.clone();
        let cancel_flag = cancel.clone();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await?;
            if cancel_flag.load(Ordering::Relaxed) {
                anyhow::bail!("cancelled");
            }
            super::image::download_image(&c, &url, &id, &path, cancel_flag.clone())
                .await
                .with_context(|| format!("downloading page {}", i + 1))?;
            paths.lock().await.push(path);
            Ok::<_, anyhow::Error>(())
        });
        handles.push(handle);
    }

    for (i, handle) in handles.into_iter().enumerate() {
        handle.await??;
        if cancel.load(Ordering::Relaxed) {
            anyhow::bail!("cancelled");
        }
        let detail = format!("{}:{}", i + 1, total);
        emit_status("downloading", Some(&detail));
    }

    let mut image_paths = Arc::try_unwrap(image_paths).unwrap().into_inner();
    image_paths.sort_by_key(|p| {
        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        name.parse::<usize>().unwrap_or(0)
    });

    info!("assembling PDF for {}", identifier);
    if cancel.load(Ordering::Relaxed) {
        anyhow::bail!("cancelled");
    }
    emit_status("assembling", None);

    let final_path = if create_pdf {
        let pdf_path = output_dir.join(format!("{title}.pdf"));
        super::pdf::images_to_pdf(&image_paths, &pdf_path, &title)?;
        tokio::fs::remove_dir_all(&dir).await.ok();
        pdf_path
    } else {
        dir
    };

    let path_str = final_path.to_string_lossy().to_string();
    emit_status("done", Some(&path_str));
    Ok(path_str)
}
