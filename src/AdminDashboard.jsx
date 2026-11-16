import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import "./admin-dashboard.css";

const OWNER_EMAIL = "anuoluwapoakinwale755@gmail.com";
const money = value => "₦" + Number(value || 0).toLocaleString("en-NG");
const imageUrl = path => !path ? "" : /^https?:\/\//i.test(path) ? path : supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
const blank = {name:"",category:"Food",price:"",stock:"",tag:"New arrival",description:"",image_path:""};

export default function AdminDashboard() {
  const [session,setSession] = useState(null);
  const [authorized,setAuthorized] = useState(false);
  const [authLoading,setAuthLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [email,setEmail] = useState(OWNER_EMAIL);
  const [password,setPassword] = useState("");
  const [tab,setTab] = useState("overview");
  const [products,setProducts] = useState([]);
  const [orders,setOrders] = useState([]);
  const [movements,setMovements] = useState([]);
  const [form,setForm] = useState(blank);
  const [editing,setEditing] = useState(null);
  const [imageFile,setImageFile] = useState(null);
  const [adjustments,setAdjustments] = useState({});
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("All");
  const [notice,setNotice] = useState("");
  const [showForm,setShowForm] = useState(false);

  const toast = message => { setNotice(message); window.setTimeout(()=>setNotice(""),3800); };

  const verifyAdmin = useCallback(async user => {
    if (!user) { setAuthorized(false); return false; }
    const {data,error} = await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
    const ok = !error && data?.role === "admin";
    setAuthorized(ok);
    return ok;
  },[]);

  const loadProducts = useCallback(async () => {
    const {data,error} = await supabase.from("products").select("*").order("created_at",{ascending:false});
    if (error) toast("Products could not load: "+error.message);
    else setProducts(data || []);
  },[]);

  const loadOrders = useCallback(async () => {
    const {data,error} = await supabase.from("orders").select("*, order_items(*)").order("created_at",{ascending:false}).limit(200);
    if (error) toast("Orders could not load: "+error.message);
    else setOrders(data || []);
  },[]);

  const loadMovements = useCallback(async () => {
    const {data,error} = await supabase.from("inventory_movements").select("*, products(name)").order("created_at",{ascending:false}).limit(100);
    if (error) toast("Inventory history could not load: "+error.message);
    else setMovements(data || []);
  },[]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadProducts(),loadOrders(),loadMovements()]);
  },[loadProducts,loadOrders,loadMovements]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({data}) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session?.user) {
        const ok = await verifyAdmin(data.session.user);
        if (ok) await refreshAll();
        else await supabase.auth.signOut();
      }
      if (alive) setAuthLoading(false);
    });
    const {data:listener} = supabase.auth.onAuthStateChange((_event,next) => {
      setSession(next);
      window.setTimeout(async () => {
        if (!alive) return;
        if (next?.user) {
          const ok = await verifyAdmin(next.user);
          if (ok) await refreshAll();
          else await supabase.auth.signOut();
        } else setAuthorized(false);
      },0);
    });
    return () => { alive=false; listener.subscription.unsubscribe(); };
  },[verifyAdmin,refreshAll]);

  const activeProducts = products.filter(p=>p.is_active);
  const totalStock = activeProducts.reduce((sum,p)=>sum+Number(p.stock||0),0);
  const lowStock = activeProducts.filter(p=>Number(p.stock)<=5);
  const pendingOrders = orders.filter(o=>o.status==="pending");
  const revenue = orders.filter(o=>o.status!=="cancelled").reduce((sum,o)=>sum+Number(o.total_ngn||0),0);
  const filteredProducts = useMemo(()=>products.filter(p=>
    (category==="All" || p.category===category) &&
    (p.name+" "+(p.description||"")).toLowerCase().includes(query.toLowerCase())
  ),[products,category,query]);

  async function login(event) {
    event.preventDefault(); setBusy(true);
    const {data,error} = await supabase.auth.signInWithPassword({email:email.trim(),password});
    if (error) toast("Sign in failed: "+error.message);
    else {
      let ok = await verifyAdmin(data.user);
      if (!ok && email.trim().toLowerCase()===OWNER_EMAIL) {
        const {error:claimError} = await supabase.rpc("claim_initial_admin");
        if (!claimError) ok = await verifyAdmin(data.user);
        else toast("Initial administrator setup: "+claimError.message);
      }
      if (ok) { toast("Secure administrator access granted."); await refreshAll(); }
      else { await supabase.auth.signOut(); toast("This account does not have administrator access."); }
    }
    setBusy(false);
  }

  async function registerFirstAdmin(event) {
    event.preventDefault();
    if (email.trim().toLowerCase()!==OWNER_EMAIL) { toast("Initial setup is restricted to the authorised business email."); return; }
    if (password.length<8) { toast("Use a password with at least 8 characters."); return; }
    setBusy(true);
    const {data,error} = await supabase.auth.signUp({email:email.trim(),password});
    if (error) toast("Registration failed: "+error.message);
    else if (data.session) {
      const {error:claimError} = await supabase.rpc("claim_initial_admin");
      if (claimError) toast("Confirm your email, then sign in to finish setup: "+claimError.message);
      else if (await verifyAdmin(data.user)) { toast("Administrator account created."); await refreshAll(); }
    } else toast("Check your inbox to confirm your email, then sign in here.");
    setBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthorized(false); setSession(null); setPassword("");
    toast("You have signed out.");
  }

  function startNew() { setEditing(null); setForm(blank); setImageFile(null); setShowForm(true); }
  function startEdit(p) {
    setEditing(p.id);
    setForm({name:p.name,category:p.category,price:String(p.price_ngn),stock:String(p.stock),tag:p.tag||"",description:p.description||"",image_path:p.image_path||""});
    setImageFile(null); setShowForm(true); window.scrollTo({top:0,behavior:"smooth"});
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!authorized) return;
    setBusy(true);
    let path = form.image_path || null;
    if (imageFile) {
      if (!["image/jpeg","image/png","image/webp"].includes(imageFile.type)) { toast("Use a JPG, PNG or WebP image."); setBusy(false); return; }
      if (imageFile.size>5*1024*1024) { toast("Image must be 5 MB or smaller."); setBusy(false); return; }
      const ext = imageFile.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
      const uploadPath = "products/"+Date.now()+"-"+Math.random().toString(36).slice(2,9)+"."+ext;
      const {error} = await supabase.storage.from("product-images").upload(uploadPath,imageFile,{contentType:imageFile.type,upsert:false});
      if (error) { toast("Image upload failed: "+error.message); setBusy(false); return; }
      path = uploadPath;
    }
    const row = {name:form.name.trim(),category:form.category,description:form.description.trim(),price_ngn:Math.round(Number(form.price)),image_path:path,tag:form.tag.trim()||null,is_active:true};
    const result = editing
      ? await supabase.from("products").update(row).eq("id",editing)
      : await supabase.from("products").insert({...row,stock:Math.max(0,Math.floor(Number(form.stock)||0))});
    if (result.error) toast("Could not save product: "+result.error.message);
    else { toast(editing?"Product updated.":"Product added to catalogue."); setShowForm(false); setForm(blank); setEditing(null); setImageFile(null); await loadProducts(); }
    setBusy(false);
  }

  async function adjustStock(product) {
    const qty = Math.floor(Number(adjustments[product.id]));
    if (!Number.isFinite(qty)||qty===0) { toast("Enter a non-zero stock quantity."); return; }
    setBusy(true);
    const {error} = await supabase.rpc("adjust_stock",{p_product_id:product.id,p_quantity_change:qty,p_reason:"Admin dashboard stock adjustment"});
    if (error) toast("Stock adjustment failed: "+error.message);
    else { toast("Stock adjusted and inventory movement recorded."); setAdjustments(old=>({...old,[product.id]:""})); await Promise.all([loadProducts(),loadMovements()]); }
    setBusy(false);
  }

  async function toggleProduct(product) {
    const {error} = await supabase.from("products").update({is_active:!product.is_active}).eq("id",product.id);
    if (error) toast("Product update failed: "+error.message);
    else { toast(product.is_active?"Product hidden from storefront.":"Product restored to storefront."); await loadProducts(); }
  }

  async function deleteProduct(product) {
    const confirmed = window.confirm("Delete \"" + product.name + "\"? This removes it from the product catalogue. Products referenced by past orders or inventory records cannot be permanently deleted.");
    if (!confirmed) return;
    setBusy(true);
    const [ordersCheck,movementsCheck] = await Promise.all([
      supabase.from("order_items").select("id",{count:"exact",head:true}).eq("product_id",product.id),
      supabase.from("inventory_movements").select("id",{count:"exact",head:true}).eq("product_id",product.id)
    ]);
    if (ordersCheck.error || movementsCheck.error) {
      toast("Could not verify product history. Nothing was deleted.");
      setBusy(false);
      return;
    }
    if ((ordersCheck.count||0)>0 || (movementsCheck.count||0)>0) {
      const {error} = await supabase.from("products").update({is_active:false}).eq("id",product.id);
      if (error) toast("Could not remove product: "+error.message);
      else { toast("This product has sales or inventory history, so it was safely archived and removed from the storefront."); await loadProducts(); }
      setBusy(false);
      return;
    }
    const {error} = await supabase.from("products").delete().eq("id",product.id);
    if (error) {
      toast("Could not delete product: "+error.message);
      setBusy(false);
      return;
    }
    if (product.image_path && !product.image_path.startsWith("http://") && !product.image_path.startsWith("https://")) {
      const {error:imageError} = await supabase.storage.from("product-images").remove([product.image_path]);
      if (imageError) toast("Product deleted, but its image could not be removed from storage.");
      else toast("Product deleted successfully.");
    } else toast("Product deleted successfully.");
    await loadProducts();
    setBusy(false);
  }

  async function changeStatus(order,status) {
    const {error} = await supabase.from("orders").update({status,updated_at:new Date().toISOString()}).eq("id",order.id);
    if (error) toast("Could not update order: "+error.message);
    else { toast("Order status updated."); await loadOrders(); }
  }

  if (authLoading) return <div className="ad-loading"><div className="ad-spinner"/><p>Preparing secure ANIKKS dashboard…</p></div>;

  if (!authorized) return <main className="ad-auth">
    <a className="ad-back" href="/">← Back to ANIKKS storefront</a>
    <section className="ad-auth-card">
      <div className="ad-logo">A<span>✦</span></div>
      <div className="ad-kicker">ANIKKS TREATS & TREND</div>
      <h1>Administrator<br/><em>portal.</em></h1>
      <p>Secure access to your store operations, inventory and customer orders.</p>
      <form onSubmit={login}>
        <label>Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
        <button className="ad-primary" disabled={busy}>{busy?"Signing in…":"Sign in securely →"}</button>
      </form>
      <details className="ad-first-setup"><summary>First-time administrator setup</summary><p>Only the authorised business email can claim the first administrator account. Email confirmation is required.</p><button className="ad-secondary" disabled={busy} onClick={registerFirstAdmin}>Create first administrator account</button></details>
      <small className="ad-security-note">Protected by Supabase Authentication and database role permissions.</small>
    </section>
    {notice&&<div className="ad-toast">{notice}</div>}
  </main>;

  return <div className="ad-shell">
    <aside className="ad-sidebar">
      <a href="/" className="ad-brand"><span>A✦</span><b>ANIKKS<small>TREATS & TREND</small></b></a>
      <div className="ad-side-label">WORKSPACE</div>
      {[["overview","▦","Overview"],["products","▤","Products"],["orders","▣","Orders"],["inventory","↗","Inventory history"]].map(([key,icon,label])=><button key={key} className={tab===key?"selected":""} onClick={()=>setTab(key)}><span>{icon}</span>{label}{key==="orders"&&pendingOrders.length>0&&<i>{pendingOrders.length}</i>}</button>)}
      <div className="ad-side-bottom"><div className="ad-user"><span className="ad-avatar">{(session?.user?.email||"A").slice(0,1).toUpperCase()}</span><div><b>Administrator</b><small>{session?.user?.email}</small></div></div><button className="ad-logout" onClick={logout}>↗ Sign out</button><a href="/">← View storefront</a></div>
    </aside>
    <main className="ad-main">
      <header className="ad-topbar"><div><div className="ad-kicker">ANIKKS / STORE MANAGEMENT</div><h1>{({overview:"Overview",products:"Product catalogue",orders:"Customer orders",inventory:"Inventory history"})[tab]}</h1></div><div className="ad-top-actions"><span className="ad-live"><i/> LIVE DATABASE</span><button onClick={refreshAll}>↻ Refresh</button><a href="/" target="_blank" rel="noreferrer">View store ↗</a><button className="ad-signout-top" onClick={logout} type="button" title="Sign out of administrator account">↗ Sign out</button></div></header>
      {tab==="overview"&&<section className="ad-content">
        <div className="ad-welcome"><div><span>YOUR BUSINESS AT A GLANCE</span><h2>Good morning,<br/><em>Administrator.</em></h2><p>Here is what is happening across your ANIKKS store.</p></div><div className="ad-welcome-art">A<span>✦</span></div></div>
        <div className="ad-metrics">
          <article><span>ACTIVE PRODUCTS</span><strong>{activeProducts.length}</strong><small>Items available in storefront</small><b>↗</b></article>
          <article><span>TOTAL STOCK UNITS</span><strong>{totalStock.toLocaleString("en-NG")}</strong><small>Across active products</small><b>▤</b></article>
          <article><span>PENDING ORDERS</span><strong>{pendingOrders.length}</strong><small>Awaiting your attention</small><b>▣</b></article>
          <article><span>ORDER VALUE</span><strong>{money(revenue)}</strong><small>All non-cancelled orders</small><b>₦</b></article>
        </div>
        <div className="ad-overview-grid"><section className="ad-card"><div className="ad-card-head"><div><span>NEEDS ATTENTION</span><h3>Low stock alerts</h3></div><button onClick={()=>setTab("products")}>Manage stock →</button></div>{lowStock.length?lowStock.slice(0,6).map(p=><div className="ad-alert" key={p.id}><span className="ad-alert-dot"/><b>{p.name}</b><small>{p.stock} left</small></div>):<div className="ad-empty">All active products have healthy stock levels.</div>}</section>
        <section className="ad-card"><div className="ad-card-head"><div><span>RECENT ACTIVITY</span><h3>Latest orders</h3></div><button onClick={()=>setTab("orders")}>View all →</button></div>{orders.slice(0,5).length?orders.slice(0,5).map(o=><div className="ad-recent-order" key={o.id}><div><b>{o.order_number}</b><small>{o.customer_name}</small></div><strong>{money(o.total_ngn)}</strong><span className={"ad-status "+o.status}>{o.status}</span></div>):<div className="ad-empty">Your customer orders will appear here.</div>}</section></div>
      </section>}
      {tab==="products"&&<section className="ad-content"><div className="ad-page-intro"><div><span>YOUR SHOPPING COLLECTION</span><h2>Products & stock</h2><p>Create products, manage pricing and keep inventory accurate.</p></div><button className="ad-primary ad-add" onClick={startNew}>＋ Add product</button></div>
        {showForm&&<form className="ad-product-form" onSubmit={saveProduct}><div className="ad-form-title"><h3>{editing?"Edit product":"Add a new product"}</h3><button type="button" onClick={()=>setShowForm(false)}>✕</button></div><div className="ad-form-grid"><label>Product name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Food</option><option>Shades</option><option>Perfumes</option></select></label><label>Price (₦)<input type="number" min="1" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label>{!editing&&<label>Opening stock<input type="number" min="0" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label>}<label>Product tag<input value={form.tag} onChange={e=>setForm({...form,tag:e.target.value})}/></label><label>Product image (JPG, PNG, WebP · max 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImageFile(e.target.files?.[0]||null)}/></label><label className="ad-wide">Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div>{form.image_path&&!imageFile&&<img className="ad-image-preview" src={imageUrl(form.image_path)} alt="Current product"/>}<div className="ad-form-actions"><button className="ad-primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Create product"}</button><button type="button" className="ad-secondary" onClick={()=>setShowForm(false)}>Cancel</button></div></form>}
        <div className="ad-toolbar"><input placeholder="Search products…" value={query} onChange={e=>setQuery(e.target.value)}/><select value={category} onChange={e=>setCategory(e.target.value)}><option>All</option><option>Food</option><option>Shades</option><option>Perfumes</option></select><span>{filteredProducts.length} products</span></div>
        <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{filteredProducts.map(p=><tr key={p.id}><td><div className="ad-product-cell">{p.image_path?<img src={imageUrl(p.image_path)} alt=""/>:<span className="ad-no-image">A</span>}<b>{p.name}<small>{p.tag||"—"}</small></b></div></td><td>{p.category}</td><td>{money(p.price_ngn)}</td><td><div className="ad-stock-control"><input aria-label={"Adjust stock for "+p.name} type="number" placeholder="+/-" value={adjustments[p.id]||""} onChange={e=>setAdjustments({...adjustments,[p.id]:e.target.value})}/><button onClick={()=>adjustStock(p)} disabled={busy}>Apply</button><b className={p.stock<=5?"low":""}>{p.stock}</b></div></td><td><span className={"ad-status "+(p.is_active?"active":"hidden")}>{p.is_active?"Active":"Hidden"}</span></td><td><div className="ad-actions"><button onClick={()=>startEdit(p)}>Edit</button><button onClick={()=>toggleProduct(p)}>{p.is_active?"Hide":"Restore"}</button><button className="ad-delete" onClick={()=>deleteProduct(p)} disabled={busy}>Delete</button></div></td></tr>)}</tbody></table>{filteredProducts.length===0&&<div className="ad-empty">No matching products yet. Add your first product to get started.</div>}</div>
      </section>}
      {tab==="orders"&&<section className="ad-content"><div className="ad-page-intro"><div><span>FULFILMENT & CUSTOMER CARE</span><h2>Customer orders</h2><p>Review customer details, order items and update fulfilment status.</p></div><button className="ad-secondary" onClick={loadOrders}>↻ Refresh orders</button></div><div className="ad-order-list">{orders.length?orders.map(o=><article className="ad-order-card" key={o.id}><div className="ad-order-top"><div><span>{o.order_number}</span><h3>{o.customer_name}</h3><small>{new Date(o.created_at).toLocaleString("en-NG")}</small></div><div><strong>{money(o.total_ngn)}</strong><span className={"ad-status "+o.status}>{o.status}</span></div></div><div className="ad-order-info"><span>☎ {o.phone}</span><span>⌖ {o.delivery_address}</span></div>{o.notes&&<p className="ad-order-note">Note: {o.notes}</p>}<div className="ad-order-items">{(o.order_items||[]).map(i=><div key={i.id}><span>{i.product_name} × {i.quantity}</span><b>{money(i.line_total_ngn)}</b></div>)}</div><div className="ad-order-bottom"><span>{(o.order_items||[]).length} line item(s)</span><label>Update status <select value={o.status} onChange={e=>changeStatus(o,e.target.value)}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div></article>):<div className="ad-empty">No customer orders have been received yet.</div>}</div></section>}
      {tab==="inventory"&&<section className="ad-content"><div className="ad-page-intro"><div><span>STOCK CONTROL</span><h2>Inventory history</h2><p>Audit trail of stock additions, reductions and customer orders.</p></div><button className="ad-secondary" onClick={loadMovements}>↻ Refresh history</button></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>DATE</th><th>PRODUCT</th><th>CHANGE</th><th>REASON</th><th>REFERENCE</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString("en-NG")}</td><td>{m.products?.name||"Product"}</td><td><b className={m.quantity_change>0?"ad-positive":"ad-negative"}>{m.quantity_change>0?"+":""}{m.quantity_change}</b></td><td>{m.reason||"—"}</td><td>{m.order_id?"Customer order":"Manual adjustment"}</td></tr>)}</tbody></table>{movements.length===0&&<div className="ad-empty">Inventory changes will be listed here.</div>}</div></section>}
      <footer className="ad-footer">ANIKKS TREATS & TREND <span>Secure store operations · Supabase protected</span></footer>
    </main>
    {notice&&<div className="ad-toast">{notice}</div>}
  </div>;
}

