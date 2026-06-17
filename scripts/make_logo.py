import cairosvg

ICON = '''
  <g transform="translate(360,205) scale(7.5)">
    <ellipse cx="32" cy="34" rx="22" ry="18" fill="#FACC15"/>
    <ellipse cx="32" cy="34" rx="22" ry="18" fill="none" stroke="#E0A800" stroke-width="2.5"/>
    <ellipse cx="24" cy="27" rx="6" ry="4" fill="#FDE68A"/>
    <path d="M40 16 C46 12 54 14 54 14 C54 14 52 22 46 24 C42 25 39 22 40 16 Z" fill="#4CAF50"/>
    <path d="M32 18 C34 14 38 13 40 16" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  </g>
'''

TEXT = '''
  <text x="632" y="822" text-anchor="end" font-family="DejaVu Serif, Georgia, serif" font-weight="bold" font-size="140" fill="#0f172a">Lemon</text>
  <text x="640" y="822" text-anchor="start" font-family="DejaVu Serif, Georgia, serif" font-weight="bold" font-size="140" fill="#E0A800">Pros</text>
  <text x="600" y="902" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="44" letter-spacing="12" fill="#94a3b8">LEMON LAW HELP</text>
'''

def svg(bg):
    rect = f'<rect width="1200" height="1200" fill="{bg}"/>' if bg else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">{rect}{ICON}{TEXT}</svg>'''

out_dir = "/app/frontend/public"
cairosvg.svg2png(bytestring=svg("#ffffff").encode(), write_to=f"{out_dir}/lemon-pros-logo-square-1200.png", output_width=1200, output_height=1200)
cairosvg.svg2png(bytestring=svg(None).encode(), write_to=f"{out_dir}/lemon-pros-logo-square-transparent-1200.png", output_width=1200, output_height=1200)
print("done")
