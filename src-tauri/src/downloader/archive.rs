use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BookMetadata {
    pub identifier: String,
    pub title: Option<String>,
    pub creator: Option<Vec<String>>,
    pub date: Option<String>,
    pub publisher: Option<String>,
    pub language: Option<String>,
    pub image_count: Option<i64>,
}

pub async fn fetch_metadata(identifier: &str) -> Result<BookMetadata> {
    let url = format!("https://archive.org/details/{identifier}");
    let body = reqwest::get(&url).await?.text().await?;
    let info_url = extract_info_url(&body)?;
    let data: serde_json::Value = reqwest::get(&info_url).await?.json().await?;
    parse_metadata(&data, identifier)
}

pub async fn login(client: &reqwest::Client, email: &str, password: &str) -> Result<()> {
    info!("logging in as {}", email);
    let token_resp: serde_json::Value = client
        .get("https://archive.org/services/account/login/")
        .send()
        .await?
        .json()
        .await?;
    let token = token_resp["value"]["token"]
        .as_str()
        .context("login token missing")?;

    let data = serde_json::json!({"username": email, "password": password, "t": token});
    let resp_text = client
        .post("https://archive.org/services/account/login/")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(data.to_string())
        .send()
        .await?
        .text()
        .await?;

    let resp: serde_json::Value = serde_json::from_str(&resp_text)
        .with_context(|| format!("error decoding login response: {resp_text}"))?;

    if !resp["success"].as_bool().unwrap_or(false) {
        anyhow::bail!(
            "login failed: {}",
            resp["value"].as_str().unwrap_or("unknown")
        );
    }
    info!("login successful");
    Ok(())
}

pub async fn loan_book(client: &reqwest::Client, book_id: &str) -> Result<()> {
    info!("loaning book {}", book_id);
    let grant = serde_json::json!({
        "action": "grant_access",
        "identifier": book_id
    });
    client
        .post("https://archive.org/services/loans/loan/searchInside.php")
        .form(&grant)
        .send()
        .await?;

    let mut browse = grant.clone();
    browse["action"] = "browse_book".into();
    let browse_resp = client
        .post("https://archive.org/services/loans/loan/")
        .form(&browse)
        .send()
        .await?;
    let status = browse_resp.status();
    let browse_text = browse_resp.text().await?;

    // Public-domain / unrestricted books respond with a 400 saying the book
    // cannot be borrowed - that means no token is needed and we can proceed.
    if status == reqwest::StatusCode::BAD_REQUEST {
        let is_free_book = serde_json::from_str::<serde_json::Value>(&browse_text)
            .ok()
            .and_then(|v| v["error"].as_str().map(|s| s.to_string()))
            == Some("This book is not available to borrow at this time. Please try again later.".to_string());
        if is_free_book {
            info!("book {} does not need to be borrowed", book_id);
            return Ok(());
        }
        anyhow::bail!("loan failed: {}", browse_text);
    }
    if !status.is_success() {
        anyhow::bail!("loan failed: HTTP {status}: {browse_text}");
    }

    let mut token_req = browse.clone();
    token_req["action"] = "create_token".into();
    let resp = client
        .post("https://archive.org/services/loans/loan/")
        .form(&token_req)
        .send()
        .await?;
    let text = resp.text().await?;
    if !text.contains("token") {
        anyhow::bail!("loan failed: no token");
    }
    Ok(())
}

pub async fn get_book_infos(
    client: &reqwest::Client,
    identifier: &str,
) -> Result<(String, Vec<String>, BookMetadata)> {
    let url = format!("https://archive.org/details/{identifier}");
    let body = client.get(&url).send().await?.text().await?;
    let info_url = extract_info_url(&body)?;
    let data: serde_json::Value = client.get(&info_url).send().await?.json().await?;

    let metadata = &data["data"]["metadata"];
    let title_raw = metadata["title"]
        .as_str()
        .unwrap_or(identifier)
        .trim()
        .replace(" ", "_");
    let title: String = title_raw
        .chars()
        .filter(|c| !r#"<>\":/\\|?*"#.contains(*c))
        .take(150)
        .collect();

    let mut links = Vec::new();
    if let Some(items) = data["data"]["brOptions"]["data"].as_array() {
        for item in items {
            if let Some(pages) = item.as_array() {
                for page in pages {
                    if let Some(uri) = page["uri"].as_str() {
                        links.push(uri.to_string());
                    }
                }
            }
        }
    }

    let meta = parse_metadata(&data, identifier)?;
    Ok((title, links, meta))
}

fn extract_info_url(body: &str) -> Result<String> {
    let part = body
        .split("\"url\":\"")
        .nth(1)
        .context("no metadata url")?;
    let url = part
        .split('"')
        .next()
        .context("malformed metadata url")?;
    Ok(format!("https:{}", url.replace("\\u0026", "&")))
}

pub async fn search_books(req: &crate::commands::search::SearchRequest) -> Result<crate::commands::search::SearchResponse> {
    let q = if req.query.trim().is_empty() {
        "mediatype:texts".to_string()
    } else {
        format!("({}) AND mediatype:texts", req.query.trim())
    };
    let start = (req.page.saturating_sub(1)) * req.rows;

    let client = reqwest::Client::new();
    let resp: serde_json::Value = client
        .get("https://archive.org/advancedsearch.php")
        .query(&[
            ("q", q.as_str()),
            ("output", "json"),
            ("rows", &req.rows.to_string()),
            ("page", &req.page.to_string()),
        ])
        .query(&[
            ("fl[]", "identifier"),
            ("fl[]", "title"),
            ("fl[]", "creator"),
            ("fl[]", "year"),
            ("fl[]", "description"),
        ])
        .send()
        .await?
        .json()
        .await?;

    let response = resp
        .get("response")
        .context("search response missing")?;
    let num_found = response
        .get("numFound")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let docs = response
        .get("docs")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|d| crate::commands::search::SearchResult {
                    identifier: d
                        .get("identifier")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    title: d
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Untitled")
                        .to_string(),
                    creator: d.get("creator").and_then(|v| {
                        if let Some(arr) = v.as_array() {
                            arr.first()
                                .and_then(|x| x.as_str())
                                .map(|s| s.to_string())
                        } else {
                            v.as_str().map(|s| s.to_string())
                        }
                    }),
                    year: d
                        .get("year")
                        .and_then(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string()))),
                    description: d.get("description").and_then(|v| {
                        if let Some(arr) = v.as_array() {
                            arr.first()
                                .and_then(|x| x.as_str())
                                .map(|s| s.to_string())
                        } else {
                            v.as_str().map(|s| s.to_string())
                        }
                    }),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(crate::commands::search::SearchResponse {
        num_found,
        start,
        docs,
    })
}

fn parse_metadata(data: &serde_json::Value, identifier: &str) -> Result<BookMetadata> {
    let metadata = data
        .get("data")
        .and_then(|d| d.get("metadata"))
        .context("missing metadata")?;

    let title = metadata.get("title").and_then(|v| v.as_str()).map(String::from);
    let creator = metadata.get("creator").and_then(|v| {
        if let Some(arr) = v.as_array() {
            Some(
                arr.iter()
                    .filter_map(|x| x.as_str().map(String::from))
                    .collect(),
            )
        } else {
            v.as_str().map(|s| vec![s.to_string()])
        }
    });
    let date = metadata.get("date").and_then(|v| v.as_str()).map(String::from);
    let publisher = metadata
        .get("publisher")
        .and_then(|v| v.as_str())
        .map(String::from);
    let language = metadata
        .get("language")
        .and_then(|v| v.as_str())
        .map(String::from);
    let image_count = data
        .get("data")
        .and_then(|d| d.get("brOptions"))
        .and_then(|b| b.get("data"))
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .map(|item| item.as_array().map(|p| p.len()).unwrap_or(0))
                .sum::<usize>() as i64
        })
        .or_else(|| metadata.get("image_count").and_then(|v| v.as_str()?.parse().ok()));

    Ok(BookMetadata {
        identifier: identifier.to_string(),
        title,
        creator,
        date,
        publisher,
        language,
        image_count,
    })
}
