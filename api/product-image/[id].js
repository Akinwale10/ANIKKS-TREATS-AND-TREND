function productImageUrl(base, path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\\/\\//i.test(raw)) return raw;
  const clean = raw.replace(/^\\/+/, "")
    .replace(/^storage\\/v1\\/object\\/public\\/product-images\\//, "")
    .replace(/^product-images\\//, "");
  return base.replace(/\\/$/, "") + "/storage/v1/object/public/product-images/" +
    clean.split("/").map(encodeURIComponent).join("/");
}

export default async function handler(req, res) {
  const id = String(req.query?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).send("Invalid product image link.");
    return;
  }
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://kkkywxvyofltqvsepawx.supabase.co";
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    res.status(503).send("Product image unavailable.");
    return;
  }
  try {
    const endpoint = base.replace(/\\/$/, "") +
      "/rest/v1/products?id=eq." + encodeURIComponent(id) +
      "&is_active=eq.true&select=image_path&limit=1";
    const lookup = await fetch(endpoint, {headers:{apikey:key,Authorization:"Bearer "+key}});
    if (!lookup.ok) throw new Error("Product lookup failed");
    const rows = await lookup.json();
    const source = productImageUrl(base, rows?.[0]?.image_path);
    if (!source) {
      res.status(404).send("Product image not found.");
      return;
    }
    const imageResponse = await fetch(source);
    if (!imageResponse.ok) throw new Error("Image fetch failed");
    const type = imageResponse.headers.get("content-type") || "application/octet-stream";
    if (!type.startsWith("image/")) throw new Error("Invalid image type");
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(bytes);
  } catch (error) {
    res.status(502).send("Could not load product image.");
  }
}
