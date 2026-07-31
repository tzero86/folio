use std::path::Path;

use anyhow::{Context, Result};

pub async fn download_book<F>(
    client: &reqwest::Client,
    identifier: &str,
    output_dir: &Path,
    resolution: i32,
    create_pdf: bool,
    emit_status: F,
) -> Result<String>
where
    F: Fn(&str, Option<&str>),
{
    emit_status("started", None);

    super::archive::loan_book(client, identifier).await?;
    let (title, links, _) = super::archive::get_book_infos(client, identifier).await?;

    let dir = output_dir.join(&title);
    tokio::fs::create_dir_all(&dir).await?;

    let width = links.len().to_string().len();
    let mut image_paths = Vec::with_capacity(links.len());

    for (i, link) in links.iter().enumerate() {
        let url = format!("{link}&rotate=0&scale={resolution}");
        let path = dir.join(format!("{:0>width$}.jpg", i + 1));
        super::image::download_image(client, &url, identifier, &path)
            .await
            .with_context(|| format!("downloading page {}", i + 1))?;
        image_paths.push(path);
        let progress = ((i + 1) as f64 / links.len() as f64 * 100.0) as u32;
        let detail = format!("{}/{}:{}", i + 1, links.len(), progress);
        emit_status("downloading", Some(&detail));
    }

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
