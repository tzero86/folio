use tauri::command;
use sqlx::sqlite::SqlitePool;

use crate::library::{LibraryBook, add_book, list_books, find_book, delete_book};

#[command]
pub async fn add_library_book(pool: tauri::State<'_, SqlitePool>, book: LibraryBook) -> Result<(), String> {
    add_book(&pool, &book).await.map_err(|e| e.to_string())
}

#[command]
pub async fn list_library_books(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<LibraryBook>, String> {
    list_books(&pool).await.map_err(|e| e.to_string())
}

#[command]
pub async fn find_library_book(pool: tauri::State<'_, SqlitePool>, identifier: String) -> Result<Option<LibraryBook>, String> {
    find_book(&pool, &identifier).await.map_err(|e| e.to_string())
}

#[command]
pub async fn delete_library_book(pool: tauri::State<'_, SqlitePool>, identifier: String) -> Result<(), String> {
    delete_book(&pool, &identifier).await.map_err(|e| e.to_string())
}
