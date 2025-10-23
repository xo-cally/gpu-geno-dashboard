# GPU Genotyping Dashboard (static)

A lightweight, static dashboard for:
- **Cohort calls** summary (supports long `label,count` or wide AA/AB/BB/NoCall matrix).
- **Cluster plots** via pre-rendered **PNG** images: `SNPID_k1.png`, `SNPID_k2.png`, `SNPID_k3.png`.

No backend required. Works locally (open `index.html`) or on GitHub Pages.

## Quick start
1. Clone/download this repo.
2. Open `index.html` in Chrome/Firefox/Edge.
3. In the **Start** tab:
   - Click **Load** to pick your `cohort_calls.csv` (or use **Load from data/** if you place it in `data/`).
   - Click **Load** under Cluster PNGs and select a folder or multi-select files.
4. Switch to **Cohort calls** to see the pie & counts, or **K=1/2/3** to view cluster images.
   - The **SNP** dropdown only shows SNPs that have an image for the active K.

> Your data isn’t uploaded anywhere when you use the file pickers — it stays in your browser.

## File formats
### Cohort calls CSV
- **Long:** `label,count` rows (labels: `AA`, `AB`, `BB`, `NoCall`).
- **Wide:** first column is SNP ID, remaining cells contain `AA|AB|BB|NoCall`.

### Cluster images
- Filenames like `rs123_k1.png`, `rs123-k2.png`, or `rs123.k3.png`.

## Optional local server
Opening `index.html` directly is fine.  
If you prefer a local server:
```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
