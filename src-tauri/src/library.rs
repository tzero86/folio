use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryBook {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub creator: Option<String>,
    pub year: Option<String>,
    pub pages: Option<i64>,
    pub pdf_path: String,
    pub cover_url: Option<String>,
    pub downloaded_at: String,
}

pub async fn init_db(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            identifier TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            creator TEXT,
            year TEXT,
            pages INTEGER,
            pdf_path TEXT NOT NULL,
            cover_url TEXT,
            downloaded_at TEXT NOT NULL
        )"
    ).execute(pool).await?;
    Ok(())
}

pub async fn add_book(pool: &SqlitePool, book: &LibraryBook) -> Result<()> {
    sqlx::query(
        "INSERT OR REPLACE INTO books (id, identifier, title, creator, year, pages, pdf_path, cover_url, downloaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&book.id)
    .bind(&book.identifier)
    .bind(&book.title)
    .bind(&book.creator)
    .bind(&book.year)
    .bind(&book.pages)
    .bind(&book.pdf_path)
    .bind(&book.cover_url)
    .bind(&book.downloaded_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_books(pool: &SqlitePool) -> Result<Vec<LibraryBook>> {
    let books = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<i64>, String, Option<String>, String)>(
        "SELECT id, identifier, title, creator, year, pages, pdf_path, cover_url, downloaded_at FROM books ORDER BY downloaded_at DESC"
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(id, identifier, title, creator, year, pages, pdf_path, cover_url, downloaded_at)| LibraryBook {
        id, identifier, title, creator, year, pages, pdf_path, cover_url, downloaded_at,
    })
    .collect();
    Ok(books)
}

pub async fn find_book(pool: &SqlitePool, identifier: &str) -> Result<Option<LibraryBook>> {
    let result = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<i64>, String, Option<String>, String)>(
        "SELECT id, identifier, title, creator, year, pages, pdf_path, cover_url, downloaded_at FROM books WHERE identifier = ?"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    Ok(result.map(|(id, identifier, title, creator, year, pages, pdf_path, cover_url, downloaded_at)| LibraryBook {
        id, identifier, title, creator, year, pages, pdf_path, cover_url, downloaded_at,
    }))
}

pub async fn delete_book(pool: &SqlitePool, identifier: &str) -> Result<()> {
    sqlx::query("DELETE FROM books WHERE identifier = ?")
        .bind(identifier)
        .execute(pool)
        .await?;
    Ok(())
}
