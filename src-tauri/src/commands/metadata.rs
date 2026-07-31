use crate::downloader::archive::{fetch_metadata, BookMetadata};

#[tauri::command]
pub async fn fetch_book_metadata(identifier: String) -> Result<BookMetadata, String> {
    fetch_metadata(&identifier)
        .await
        .map_err(|e| format!("metadata fetch failed: {e}"))
}
