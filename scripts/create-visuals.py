"""Create OG image + social share banner for Sargasses project."""
from PIL import Image, ImageDraw, ImageFont
import os

FONTS_DIR = r"C:\Users\user\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\7332a16b-3b17-44ef-a02f-0a926faeac13\01200199-5ca5-4aa9-b48f-c1b46eb8532b\skills\canvas-design\canvas-fonts"
OUT_DIR = r"C:\Users\user\Desktop\Backup\sargagame\public"

NAVY = (13, 30, 28)
GOLD = (232, 168, 0)
TEAL = (0, 158, 142)
GREEN = (34, 197, 94)
WHITE = (255, 255, 255)
MUTED = (104, 104, 104)
DARK_ACCENT = (20, 42, 38)

bold = os.path.join(FONTS_DIR, "BricolageGrotesque-Bold.ttf")
reg = os.path.join(FONTS_DIR, "BricolageGrotesque-Regular.ttf")
big = os.path.join(FONTS_DIR, "BigShoulders-Bold.ttf")

# ═══ 1. OG IMAGE (1200x630) ═══
img = Image.new('RGB', (1200, 630), NAVY)
draw = ImageDraw.Draw(img)

# Subtle wave pattern
for i in range(0, 1200, 60):
    for j in range(0, 630, 60):
        offset = (i // 60) % 2 * 30
        draw.ellipse([i+10, j+offset+20, i+14, j+offset+24], fill=DARK_ACCENT)

# Gold accent bar top
draw.rectangle([0, 0, 1200, 5], fill=GOLD)

# Green dot (LIVE indicator)
draw.ellipse([80, 80, 96, 96], fill=GREEN)
draw.text((108, 78), "LIVE", fill=GREEN, font=ImageFont.truetype(reg, 18))

# Main headline
font_main = ImageFont.truetype(big, 72)
draw.text((80, 160), "Ce weekend,", fill=WHITE, font=font_main)
draw.text((80, 240), "quelle plage", fill=WHITE, font=font_main)
draw.text((80, 320), "choisir ?", fill=GOLD, font=font_main)

# Subtitle
font_sub = ImageFont.truetype(reg, 26)
draw.text((80, 430), "Bulletin gratuit chaque vendredi", fill=GOLD, font=font_sub)

# Stats badges
font_badge = ImageFont.truetype(bold, 20)
badges = [("135", "plages", GREEN), ("4x/jour", "satellite", TEAL), ("Gratuit", "", GOLD)]
x = 80
for num, label, color in badges:
    draw.rounded_rectangle([x, 490, x+140, 530], radius=16, fill=(color[0], color[1], color[2], 40), outline=color)
    draw.text((x+14, 496), f"{num} {label}", fill=color, font=ImageFont.truetype(reg, 16))
    x += 160

# Domain
font_domain = ImageFont.truetype(reg, 16)
draw.text((850, 580), "sargasses-martinique.com", fill=MUTED, font=font_domain)

# Right side: abstract coastline
for i in range(20):
    y = 100 + i * 25
    w = 40 + (i % 5) * 15
    alpha = 180 - i * 6
    color = (*TEAL, alpha) if i % 3 != 0 else (*GOLD, alpha)
    draw.rounded_rectangle([1050 - w//2, y, 1050 + w//2, y + 16], radius=8, fill=color[:3])

# Gold accent bar bottom
draw.rectangle([0, 625, 1200, 630], fill=GOLD)

img.save(os.path.join(OUT_DIR, "og-weekend.png"), quality=95)
print("OK: public/og-weekend.png (1200x630)")

# ═══ 2. SOCIAL SHARE BANNER (1080x1080) ═══
img2 = Image.new('RGB', (1080, 1080), NAVY)
draw2 = ImageDraw.Draw(img2)

# Background pattern - ocean grid
for i in range(0, 1080, 40):
    draw2.line([(i, 0), (i, 1080)], fill=DARK_ACCENT, width=1)
    draw2.line([(0, i), (1080, i)], fill=DARK_ACCENT, width=1)

# Gold frame
draw2.rectangle([30, 30, 1050, 1050], outline=GOLD, width=2)

# Top: LIVE badge
draw2.rounded_rectangle([80, 80, 280, 120], radius=20, fill=DARK_ACCENT)
draw2.ellipse([96, 92, 112, 108], fill=GREEN)
draw2.text((122, 90), "LIVE satellite", fill=GREEN, font=ImageFont.truetype(reg, 20))

# Center: Big number
font_huge = ImageFont.truetype(big, 200)
font_unit = ImageFont.truetype(big, 60)
draw2.text((300, 220), "3", fill=GOLD, font=font_huge)

# Label
font_label = ImageFont.truetype(bold, 48)
draw2.text((80, 460), "plages propres", fill=WHITE, font=font_label)
draw2.text((80, 520), "ce weekend", fill=WHITE, font=font_label)

# Separator
draw2.rectangle([80, 600, 400, 603], fill=GOLD)

# Beach names preview
font_beach = ImageFont.truetype(reg, 24)
beaches = [("Grande Anse d'Arlet", GREEN), ("Anse Noire", GREEN), ("Anse Mitan", GREEN)]
y = 640
for name, color in beaches:
    draw2.ellipse([80, y+4, 94, y+18], fill=color)
    draw2.text((110, y), name, fill=WHITE, font=font_beach)
    y += 40

# Bottom CTA
draw2.rounded_rectangle([80, 840, 1000, 920], radius=20, fill=GOLD)
font_cta = ImageFont.truetype(bold, 30)
draw2.text((200, 864), "Recevoir le bulletin weekend", fill=NAVY, font=font_cta)

# Footer
font_footer = ImageFont.truetype(reg, 18)
draw2.text((80, 960), "Gratuit  ·  Par email  ·  Chaque vendredi", fill=MUTED, font=font_footer)
draw2.text((80, 990), "sargasses-martinique.com/weekend.html", fill=(*GOLD, 180), font=font_footer)

# Gold accent bottom
draw2.rectangle([30, 1045, 1050, 1050], fill=GOLD)

img2.save(os.path.join(OUT_DIR, "social-share.png"), quality=95)
print("OK: public/social-share.png (1080x1080)")
