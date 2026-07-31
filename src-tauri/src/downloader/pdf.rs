use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use anyhow::{Context, Result};
use printpdf::image_crate::{self, GenericImageView};
use printpdf::*;

pub fn images_to_pdf(image_paths: &[std::path::PathBuf], output: &Path, title: &str) -> Result<()> {
    if image_paths.is_empty() {
        anyhow::bail!("no images to assemble");
    }

    let first_img = image_crate::open(&image_paths[0])?;
    let (w_px, h_px) = first_img.dimensions();

    let (doc, page1, _layer1) = PdfDocument::new(
        title.to_string(),
        Mm(w_px as f32 * 0.0847),
        Mm(h_px as f32 * 0.0847),
        "Layer 1".to_string(),
    );

    for (i, path) in image_paths.iter().enumerate() {
        let img = image_crate::open(path)?;
        let (w_px, h_px) = img.dimensions();
        let width = Mm(w_px as f32 * 0.0847);
        let height = Mm(h_px as f32 * 0.0847);

        let (page, _layer_index) = if i == 0 {
            (page1, _layer1)
        } else {
            doc.add_page(width, height, format!("Layer {}", i + 1))
        };
        let layer = doc.get_page(page).add_layer(format!("Image {}", i + 1));

        let image = Image::from_dynamic_image(&img);
        image.add_to_layer(layer, ImageTransform::default());
    }

    let file = File::create(output)
        .with_context(|| format!("creating PDF file {}", output.display()))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .with_context(|| format!("saving PDF to {}", output.display()))?;
    Ok(())
}
