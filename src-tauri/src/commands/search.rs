use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Clone, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_rows")]
    pub rows: u32,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub year_from: Option<i32>,
    #[serde(default)]
    pub year_to: Option<i32>,
    /// "relevance" | "downloads" | "title" | "newest" | "oldest"
    #[serde(default)]
    pub sort: Option<String>,
}

fn default_page() -> u32 {
    1
}

fn default_rows() -> u32 {
    50
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub identifier: String,
    pub title: String,
    pub creator: Option<String>,
    pub year: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub num_found: i64,
    pub start: u32,
    pub docs: Vec<SearchResult>,
}

#[command]
pub async fn search_archive(req: SearchRequest) -> Result<SearchResponse, String> {
    crate::downloader::archive::search_books(&req)
        .await
        .map_err(|e| e.to_string())
}
