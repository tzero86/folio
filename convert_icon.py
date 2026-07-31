from PIL import Image
import os

png_path = r"C:/Users/Tzero86/.gemini/antigravity/brain/7fd8d17c-bf26-41bc-9322-eda5b67c7924/app_icon_base_1769553758490.png"
ico_path = "app.ico"

img = Image.open(png_path)
img.save(ico_path, format='ICO', sizes=[(256, 256)])
print(f"Converted {png_path} to {ico_path}")
