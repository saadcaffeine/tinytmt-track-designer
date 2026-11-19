"""Inline CSS, JS and the icon into a single offline HTML file: tinytmt-standalone.html"""
import base64, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
icon = 'data:image/svg+xml;base64,' + base64.b64encode((root / 'icon.svg').read_bytes()).decode()
html = html.replace('<link rel="stylesheet" href="css/styles.css" />', '<style>\n' + (root / 'css/styles.css').read_text() + '\n</style>')
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>\n' + (root / m.group(1)).read_text().replace('</script', '<\\/script') + '\n</script>', html)
html = html.replace('<link rel="manifest" href="manifest.webmanifest" />\n', '')
html = html.replace('href="icon.svg"', f'href="{icon}"').replace('src="icon.svg"', f'src="{icon}"')
# The 3D add-on loads three.js on demand; embed the bundle as inert text so it still works from a single file.
three = (root / 'vendor/three-view3d.min.js').read_text().replace('</script', '<\\/script')
html = html.replace('</body>', '<script type="text/plain" id="tinytmt-three-src">\n' + three + '\n</script>\n</body>')
(root / 'tinytmt-standalone.html').write_text(html)
print('wrote tinytmt-standalone.html', len(html), 'bytes')
