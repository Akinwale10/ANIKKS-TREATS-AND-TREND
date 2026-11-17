function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}

function productImageUrl(base, path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const clean = raw
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/public\/product-images\//, "")
    .replace(/^product-images\//, "");
  return base.replace(/\/$/, "") + "/storage/v1/object/public/product-images/" +
    clean.split("/").map(encodeURIComponent).join("/");
}

export default async function handler(req, res) {
  const id = String(req.query?.id || "");
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://kkkywxvyofltqvsepawx.supabase.co";
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).send("Invalid product link.");
    return;
  }
  if (!key) {
    res.status(503).send("Product sharing is temporarily unavailable. Please open the shop directly.");
    return;
  }

  try {
    const endpoint = base.replace(/\/$/, "") +
      "/rest/v1/products?id=eq." + encodeURIComponent(id) +
      "&is_active=eq.true&select=id,name,description,price_ngn,category,image_path&limit=1";
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: "Bearer " + key }
    });
    if (!response.ok) throw new Error("Product lookup failed");
    const rows = await response.json();
    const product = rows?.[0];
    if (!product) {
      res.status(404).send("This product is no longer available.");
      return;
    }

    const origin = "https://annikstreat.vercel.app";
    const shareUrl = origin + "/product/" + encodeURIComponent(id);
    const destination = origin + "/?product=" + encodeURIComponent(id);
    const image = origin + "/api/product-image/" + encodeURIComponent(id);
    const title = product.name + " | ANIKKS Treats & Trend";
    const description = [product.category, "₦" + Number(product.price_ngn || 0).toLocaleString("en-NG"), product.description]
      .filter(Boolean).join(" | ").slice(0, 300);
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(shareUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ANIKKS Treats & Trend">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(shareUrl)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:image:alt" content="${escapeHtml(product.name)}">

<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="1200">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}">
</head>
<body style="font-family:Arial,sans-serif;background:#fffcef;color:#24310b;text-align:center;padding:40px 16px">
<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" style="width:min(100%,420px);max-height:55vh;object-fit:contain;border-radius:12px">
<h1>${escapeHtml(product.name)}</h1>
<p>${escapeHtml(description)}</p>
<p>Opening this product on ANIKKS Treats & Trend...</p>
<a href="${escapeHtml(destination)}">View this exact product</a>
<script>window.location.replace(${JSON.stringify(destination)});</script>
</body>
</html>`;
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (error) {
    res.status(500).send("We could not prepare this product link. Please try again.");
  }
}
