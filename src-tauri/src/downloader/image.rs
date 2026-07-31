use std::path::Path;

use anyhow::{Context, Result};

pub async fn download_image(
    client: &reqwest::Client,
    link: &str,
    book_id: &str,
    output_path: &Path,
) -> Result<()> {
    let mut retries = 0;
    loop {
        let response = client
            .get(link)
            .header("Referer", "https://archive.org/")
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::FORBIDDEN && retries < 1 {
            super::archive::loan_book(client, book_id).await?;
            retries += 1;
            continue;
        }

        let status = response.status();
        if !status.is_success() {
            anyhow::bail!("HTTP {status} downloading {link}");
        }

        let obf_header = response
            .headers()
            .get("X-Obfuscate")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string());

        let mut bytes = response.bytes().await?.to_vec();
        if let Some(header) = obf_header {
            super::crypto::deobfuscate_image(&mut bytes, link, &header)
                .with_context(|| format!("deobfuscating {link}"))?;
        }

        tokio::fs::write(output_path, bytes).await?;
        return Ok(());
    }
}
