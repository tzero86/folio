use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use tokio::sync::Semaphore;

pub async fn download_book<F>(
    client: &reqwest::Client,
    identifier: &str,
    output_dir: &Path,
    resolution: i32,
    create_pdf: bool,
    save_metadata: bool,
    emit_status: F,
) -> Result<String>
where
    F: Fn(&str, Option<&str>),
{
    emit_status("started", None);

    super::archive::loan_book(client, identifier).await?;
    let (title, links, metadata) = super::archive::get_book_infos(client, identifier).await?;

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

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await?;
            super::image::download_image(&c, &url, &id, &path)
                .await
                .with_context(|| format!("downloading page {}", i + 1))?;
            paths.lock().await.push(path);
            Ok::<_, anyhow::Error>(())
        });
        handles.push(handle);
    }

    for (i, handle) in handles.into_iter().enumerate() {
        handle.await??;
        let detail = format!("{}:{}", i + 1, total);
        emit_status("downloading", Some(&detail));
    }

    let mut image_paths = Arc::try_unwrap(image_paths).unwrap().into_inner();
    image_paths.sort_by_key(|p| {
        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        name.parse::<usize>().unwrap_or(0)
    });

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
