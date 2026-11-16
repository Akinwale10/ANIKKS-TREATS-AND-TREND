import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./style.css";
import AdminDashboard from "./AdminDashboard";

const WA = "2349162259886";
const PHONE = "+2348124705254";
const money = n => "₦" + Number(n || 0).toLocaleString("en-NG");
const categories = ["All", "Food", "Shades", "Perfumes"];
const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
const currentPage = currentPath === "/" ? "home" : currentPath === "/shop" ? "shop" : currentPath.startsWith("/category/") ? "category" : currentPath.slice(1);
const emptyForm = { name:"", category:"Food", price:"", stock:"", tag:"New arrival", description:"", image_path:"" };
const heroSlides = [
  {eyebrow:"A LITTLE JOY IN EVERY BITE",title:"Treat yourself.",accent:"You deserve it.",description:"Discover delicious treats and everyday favourites, thoughtfully brought together for you.",image:"https://images.unsplash.com/photo-1603532648955-039310d9ed75?auto=format&fit=crop&w=1500&q=90",alt:"Freshly prepared sweet treats"},
  {eyebrow:"FIND YOUR EVERYDAY LOOK",title:"See the style.",accent:"Wear the confidence.",description:"Explore standout shades and accessories that bring your personal style to life.",image:"https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1500&q=90",alt:"Stylish sunglasses"},
  {eyebrow:"LEAVE A LOVELY IMPRESSION",title:"Find your scent.",accent:"Make it memorable.",description:"Discover beautiful fragrances to complement your mood and make every moment special.",image:"https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1500&q=90",alt:"Elegant perfume bottles"}
];

function publicImage(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

function App() {
  const [products, setProducts] = useState([]);
  const [featureProductImage, setFeatureProductImage] = useState("");
  useEffect(() => {
    const images = products.filter(p => p.image_path).map(p => publicImage(p.image_path));
    if (!images.length) { setFeatureProductImage(""); return; }
    const pickRandom = current => {
      const choices = images.filter(src => src !== current);
      return choices[Math.floor(Math.random() * choices.length)] || images[0];
    };
    setFeatureProductImage(current => current && images.includes(current) ? current : pickRandom(""));
    const timer = window.setInterval(() => setFeatureProductImage(current => pickRandom(current)), 4500);
    return () => window.clearInterval(timer);
  }, [products]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(currentPage === "category" ? (currentPath.split("/")[2] || "all").replace(/^./,c=>c.toUpperCase()) : "All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [customer, setCustomer] = useState({name:"",phone:"",address:"",notes:""});
  const [toast, setToast] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("products");
  const [stockAdjust, setStockAdjust] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);

  const notify = message => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  useEffect(() => { const labels={home:"Home",shop:"Shop",category:category,services:"Services",about:"Our Story",contact:"Contact"}; document.title=(labels[currentPage]||"Shop")+" | ANIKKS Treats & Trend"; }, []);
  useEffect(() => { if(currentPage!=="home") return; const timer=window.setInterval(()=>setHeroSlide(index=>(index+1)%heroSlides.length),5500); return ()=>window.clearInterval(timer); }, []);

  async function loadProducts() {
    const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("created_at", {ascending:false});
    if (error) { notify("Could not load products: " + error.message); }
    else setProducts(data || []);
    setLoading(false);
  }

  async function checkAdmin(user) {
    if (!user) { setIsAdmin(false); return false; }
    const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const ok = !error && data?.role === "admin";
    setIsAdmin(ok);
    return ok;
  }

  useEffect(() => {
    loadProducts();
    supabase.auth.getSession().then(async ({data}) => {
      setSession(data.session);
      await checkAdmin(data.session?.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      window.setTimeout(() => checkAdmin(next?.user), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const visible = useMemo(() => products.filter(p =>
    (category === "All" || p.category === category) &&
    (p.name + " " + (p.description || "") + " " + (p.tag || "")).toLowerCase().includes(search.toLowerCase())
  ), [products, category, search]);

  const count = Object.values(cart).reduce((a,b) => a+b, 0);
  const total = products.reduce((sum,p) => sum + Number(p.price_ngn) * (cart[p.id] || 0), 0);
  const cartProducts = products.filter(p => cart[p.id]);

  function add(product) {
    if ((cart[product.id] || 0) >= product.stock) { notify("Available stock limit reached."); return; }
    setCart(old => ({...old, [product.id]:(old[product.id] || 0)+1}));
  }
  function changeQty(product, delta) {
    setCart(old => {
      const next = {...old};
      const qty = (next[product.id] || 0) + delta;
      if (qty <= 0) delete next[product.id];
      else if (qty <= product.stock) next[product.id] = qty;
      else notify("Available stock limit reached.");
      return next;
    });
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (!customer.name.trim() || !customer.phone.trim() || !customer.address.trim() || !count) return;
    const items = cartProducts.map(p => ({product_id:p.id, quantity:cart[p.id]}));
    const { data, error } = await supabase.rpc("create_order", {
      p_customer_name: customer.name.trim(),
      p_phone: customer.phone.trim(),
      p_delivery_address: customer.address.trim(),
      p_notes: customer.notes.trim(),
      p_items: items
    });
    if (error) { notify("Order not placed: " + error.message); await loadProducts(); return; }
    const order = data || {};
    const lines = cartProducts.map(p => p.name + " × " + cart[p.id] + " — " + money(Number(p.price_ngn)*cart[p.id])).join("\n");
    const message = "Hello ANIKKS Treats & Trend! I have placed an order.\n\nOrder: " + order.order_number + "\n" + lines + "\n\nSubtotal: " + money(order.total_ngn) + "\nName: " + customer.name + "\nPhone: " + customer.phone + "\nDelivery: " + customer.address + "\nNote: " + (customer.notes || "None") + "\n\nPlease confirm delivery fee and payment details.";
    window.open("https://wa.me/" + WA + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
    setCart({});
    setCheckout(false);
    setCartOpen(false);
    setCustomer({name:"",phone:"",address:"",notes:""});
    notify("Order " + order.order_number + " saved successfully.");
    await loadProducts();
  }

  async function signIn(event) {
    event.preventDefault();
    setAdminLoading(true);
    const {data, error} = await supabase.auth.signInWithPassword({email:email.trim(), password});
    if (error) notify("Sign-in failed: " + error.message);
    else {
      let ok = await checkAdmin(data.user);
      if (!ok && email.trim().toLowerCase() === "anuoluwapoakinwale755@gmail.com") {
        const {error:claimError} = await supabase.rpc("claim_initial_admin");
        if (!claimError) ok = await checkAdmin(data.user);
        else notify("Administrator setup: " + claimError.message + ". Confirm your email first if you have just registered.");
      }
      if (ok) { notify("Administrator access granted."); await loadOrders(); }
      else { await supabase.auth.signOut(); }
    }
    setAdminLoading(false);
  }

  async function registerInitialAdmin() {
    if (email.trim().toLowerCase() !== "anuoluwapoakinwale755@gmail.com") {
      notify("Initial administrator registration is restricted to the authorised email address.");
      return;
    }
    if (password.length < 8) { notify("Choose a password with at least 8 characters."); return; }
    setAdminLoading(true);
    const {data,error} = await supabase.auth.signUp({email:email.trim(),password});
    if (error) notify("Registration failed: " + error.message);
    else if (data.session) {
      const {error:claimError} = await supabase.rpc("claim_initial_admin");
      if (claimError) notify("Account created, but admin setup needs email confirmation: " + claimError.message);
      else if (await checkAdmin(data.user)) { notify("Initial administrator account is ready."); await loadOrders(); }
    } else {
      notify("Check your email to confirm the account, then return here and sign in to finish administrator setup.");
    }
    setAdminLoading(false);
  }

  async function loadOrders() {
    const {data, error} = await supabase.from("orders").select("*, order_items(*)").order("created_at", {ascending:false}).limit(100);
    if (error) notify("Could not load orders: " + error.message);
    else setOrders(data || []);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setSession(null);
    notify("Signed out.");
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!isAdmin) return;
    setAdminLoading(true);
    let imagePath = form.image_path || null;
    if (imageFile) {
      const extension = (imageFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
      const path = Date.now() + "-" + Math.random().toString(36).slice(2,9) + "." + extension;
      const {error: uploadError} = await supabase.storage.from("product-images").upload(path, imageFile, {upsert:false, contentType:imageFile.type});
      if (uploadError) { notify("Image upload failed: " + uploadError.message); setAdminLoading(false); return; }
      imagePath = path;
    }
    const record = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      price_ngn: Math.round(Number(form.price)),
      image_path: imagePath,
      tag: form.tag.trim() || null,
      stock: Math.max(0, Math.floor(Number(form.stock) || 0)),
      is_active: true
    };
    if (editing) delete record.stock; // Stock changes must go through the audited atomic adjustment RPC.
    const result = editing
      ? await supabase.from("products").update(record).eq("id", editing)
      : await supabase.from("products").insert(record);
    if (result.error) notify("Product save failed: " + result.error.message);
    else {
      notify(editing ? "Product updated." : "Product added.");
      setForm(emptyForm); setEditing(null); setImageFile(null); await loadProducts();
    }
    setAdminLoading(false);
  }

  function editProduct(product) {
    setEditing(product.id);
    setForm({name:product.name, category:product.category, price:String(product.price_ngn), stock:String(product.stock), tag:product.tag || "", description:product.description || "", image_path:product.image_path || ""});
    setImageFile(null);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function hideProduct(id) {
    if (!window.confirm("Hide this product from the storefront?")) return;
    const {error} = await supabase.from("products").update({is_active:false}).eq("id",id);
    if (error) notify(error.message); else {notify("Product hidden."); await loadProducts();}
  }

  async function updateStock(product) {
    const quantity = Math.floor(Number(stockAdjust[product.id]));
    if (!Number.isFinite(quantity) || quantity === 0) { notify("Enter a non-zero stock adjustment."); return; }
    const next = product.stock + quantity;
    if (next < 0) { notify("Stock cannot be negative."); return; }
    const {error} = await supabase.rpc("adjust_stock", {p_product_id:product.id, p_quantity_change:quantity, p_reason:"Manual admin stock adjustment"});
    if (error) { notify("Stock update failed: " + error.message); return; }
    notify("Stock updated and recorded atomically.");
    setStockAdjust(old => ({...old,[product.id]:""}));
    await loadProducts();
  }

  async function updateOrderStatus(order, status) {
    const {error} = await supabase.from("orders").update({status,updated_at:new Date().toISOString()}).eq("id",order.id);
    if (error) notify("Order update failed: " + error.message);
    else {notify("Order status updated."); await loadOrders();}
  }

  return <>
    <div className="announcement">A little joy, a lot of good finds. <span>Serving Ifo & Ilaro, Ogun State</span></div>
    <header className="header">
      <a className="brand" href="/"><span className="brand-mark">A<span>✦</span></span><span>ANIKKS<small>TREATS & TREND</small></span></a>
      <button className="mobile-toggle" aria-label={mobileMenuOpen?"Close navigation":"Open navigation"} aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(open=>!open)}>{mobileMenuOpen?"×":"☰"}</button>
      <nav className={"nav"+(mobileMenuOpen?" nav-open":"")} onClick={()=>setMobileMenuOpen(false)}><a className={currentPage==="home"?"current":""} href="/">Home</a><a className={currentPage==="shop"?"current":""} href="/shop">Shop</a><a href="/category/food">Food</a><a href="/category/shades">Shades</a><a href="/category/perfumes">Perfumes</a><a className={currentPage==="services"?"current":""} href="/services">Services</a><a className={currentPage==="about"?"current":""} href="/about">Our story</a><a className={currentPage==="contact"?"current":""} href="/contact">Contact</a></nav>
      <div className="header-actions"><button className="bag-button" onClick={()=>setCartOpen(true)}>Bag <span>{count}</span></button><a className="header-whatsapp" href={"https://wa.me/"+WA} target="_blank" rel="noreferrer">Chat with us ↗</a></div>
    </header>
    <main>
      {currentPage!=="home" && <div className="page-banner"><div className="eyebrow">ANIKKS TREATS & TREND</div><h1>{currentPage==="category" ? category+" collection" : ({shop:"Shop all good finds",services:"Services that make life easier",about:"A little more about us",contact:"We would love to hear from you"}[currentPage] || "Discover ANIKKS")}</h1><p>{currentPage==="category" ? "Explore our "+category.toLowerCase()+" collection, selected with you in mind." : ({shop:"Browse our full collection of treats, style and fragrance.",services:"More than a store — practical everyday services and friendly support.",about:"The story behind our promise of great finds and everyday joy.",contact:"Questions, orders or business enquiries? We are ready to help."}[currentPage] || "Great finds. Everyday joy.")}</p><a href="/shop">Explore the shop →</a></div>}
      {currentPage==="home" && <section className="hero hero-slider" id="home"><div className="hero-copy" key={heroSlide}><div className="eyebrow"><i></i> {heroSlides[heroSlide].eyebrow}</div><h1>{heroSlides[heroSlide].title}<br/><em>{heroSlides[heroSlide].accent}</em></h1><p>{heroSlides[heroSlide].description}</p><div className="hero-actions"><a className="btn btn-orange" href="/shop">Explore the store ↗</a><a className="text-link" href="/services">Discover our services →</a></div><div className="hero-foot"><span>✦ Thoughtfully selected</span><span>✦ Friendly service</span><span>✦ Easy ordering</span></div></div><div className="hero-visual"><div className="hero-slides">{heroSlides.map((slide,index)=><img key={slide.image} className={"hero-slide"+(heroSlide===index?" active":"")} src={slide.image} alt={slide.alt} loading={index===0?"eager":"lazy"}/>)}</div><div className="hero-sticker"><span>THE ANIKKS EDIT</span><strong>Good things<br/>live here.</strong><small>FOOD · STYLE · SCENT</small></div><div className="hero-slider-controls"><button aria-label="Previous slide" onClick={()=>setHeroSlide(index=>(index+heroSlides.length-1)%heroSlides.length)}>‹</button><div className="hero-dots">{heroSlides.map((slide,index)=><button key={slide.image} aria-label={"Show slide "+(index+1)} className={heroSlide===index?"active":""} onClick={()=>setHeroSlide(index)} />)}</div><button aria-label="Next slide" onClick={()=>setHeroSlide(index=>(index+1)%heroSlides.length)}>›</button></div><div className="hero-slide-count">0{heroSlide+1} <span>/ 0{heroSlides.length}</span></div></div></section>}
      {currentPage==="home" && <section className="trust-strip"><div><b>01</b><span>GOOD THINGS</span></div><div><b>02</b><span>GREAT VALUE</span></div><div><b>03</b><span>PERSONAL SERVICE</span></div><div><b>04</b><span>JOY IN EVERY ORDER</span></div></section>}
      {currentPage==="home" && <section className="home-category-section"><div className="section-heading"><div><div className="eyebrow">EXPLORE ANIKKS</div><h2>Find your <em>favourite.</em></h2></div><p>Shop by collection and discover<br/>something made for your day.</p></div><div className="home-category-grid"><a href="/category/food"><span>01 / TREATS</span><b>Food & snacks</b><small>Discover tasty favourites ↗</small></a><a href="/category/shades"><span>02 / STYLE</span><b>Shades & eyewear</b><small>Find your look ↗</small></a><a href="/category/perfumes"><span>03 / SCENT</span><b>Perfumes</b><small>Explore beautiful scents ↗</small></a></div><a className="category-all-link" href="/shop">Explore the complete collection →</a></section>}
      {(currentPage==="shop" || currentPage==="category") && <section className="shop-section" id="shop"><div className="section section-shop"><div className="section-heading"><div><div className="eyebrow">THE GOOD FINDS EDIT</div><h2>Something for <em>everyone.</em></h2></div><p>Handpicked favourites, ready to make<br/>your day a little brighter.</p></div><div className="shop-tools"><div className="filters">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="shop-search-row"><label className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search the store..."/></label></div></div>
      {loading ? <div className="empty">Loading the ANIKKS collection…</div> : <div className="product-grid">{visible.map(p=><article className="product-card" key={p.id}><div className="product-image"><img src={publicImage(p.image_path)} alt={p.name} loading="lazy"/><span className="product-tag">{p.tag || p.category}</span><button className="quick-add" onClick={()=>add(p)} disabled={!p.stock}>+</button></div><div className="product-meta"><span>{p.category}</span><span>{p.stock>0?"IN STOCK":"OUT OF STOCK"}</span></div><h3>{p.name}</h3><p>{p.description}</p><div className="product-bottom"><strong>{money(p.price_ngn)}</strong><button disabled={!p.stock} onClick={()=>add(p)}>{p.stock?"Add to bag":"Unavailable"} <span>＋</span></button></div></article>)}</div>}
      {!loading && visible.length===0 && <div className="empty">No products found. Please check back soon or contact us on WhatsApp.</div>}
      <div className="shop-bottom"><span>{visible.length} products available</span><button onClick={()=>{setCategory("All");setSearch("");}}>View all products ↗</button></div></div></section>}
      {(currentPage==="home" || currentPage==="services") && <section className="feature-band"><div className="feature-photo">{featureProductImage ? <img key={featureProductImage} className="feature-product-image" src={featureProductImage} alt="A product from the ANIKKS collection" /> : <div className="feature-photo-fallback">ANIKKS TREATS &amp; TREND</div>}</div><div className="feature-copy"><div className="eyebrow">A LITTLE MORE THAN SHOPPING</div><h2>Good service is<br/><em>our signature.</em></h2><p>Need a POS, a Moniepoint account, business support or a quick answer? Our team is ready to help you get things moving.</p><a className="btn btn-light" href="#services">Explore our services ↗</a></div></section>}
      {(currentPage==="home" || currentPage==="services") && <section className="section services-section" id="services"><div className="section-heading"><div><div className="eyebrow">HERE TO MAKE LIFE EASIER</div><h2>More ways we can <em>help.</em></h2></div><p>Beyond the store, we're here with practical<br/>services and a friendly face.</p></div><div className="service-grid"><div className="service-card"><span className="service-icon">◈</span><small>01 / FINANCIAL SERVICES</small><h3>Moniepoint services</h3><p>POS transactions, ATM services, account opening and Moniebook support.</p><a href={"https://wa.me/"+WA}>Enquire now ↗</a></div><div className="service-card"><span className="service-icon">↗</span><small>02 / BUSINESS SUPPORT</small><h3>Grow your business</h3><p>Ask us about CAC registration support and business documentation guidance.</p><a href={"https://wa.me/"+WA}>Let's talk ↗</a></div><div className="service-card"><span className="service-icon">✳</span><small>03 / PERSONAL SUPPORT</small><h3>Friendly assistance</h3><p>Need help choosing a product or placing an order? We're only a message away.</p><a href={"https://wa.me/"+WA}>Message ANIKKS ↗</a></div></div></section>}
      {(currentPage==="home" || currentPage==="about") && <section className="about-section" id="about"><div className="about-mark">A<span>✦</span></div><div className="about-copy"><div className="eyebrow">A NOTE FROM ANIKKS</div><h2>Everyday essentials.<br/><em>Unexpected delight.</em></h2><p>ANIKKS Treats & Trend brings together the things people love — tasty treats, expressive accessories, lovely fragrances and helpful everyday services. We believe shopping should feel easy, personal and full of good energy.</p></div><div className="about-side"><strong>“</strong><p>We make room for the little things that make a big difference.</p><span>THE ANIKKS PROMISE</span></div></section>}
      {(currentPage==="home" || currentPage==="contact") && <section className="contact-section" id="contact"><div className="contact-copy"><div className="eyebrow">LET'S MAKE SOMETHING HAPPEN</div><h2>We're just a<br/><em>message away.</em></h2><p>Questions, orders, business enquiries or just saying hello — we'd love to hear from you.</p><a className="btn btn-orange" href={"https://wa.me/"+WA} target="_blank" rel="noreferrer">Start a WhatsApp chat ↗</a></div><div className="contact-details"><div><small>CALL US</small><a href="tel:+2348124705254">{PHONE}</a></div><div><small>WHATSAPP ORDERS</small><a href={"https://wa.me/"+WA}>+234 916 225 9886</a></div><div><small>FIND US</small><span>Ifo & Ilaro, Ogun State, Nigeria</span></div><div><small>FOLLOW OUR JOURNEY</small><a href="https://www.tiktok.com/@anikks.treats.trends" target="_blank" rel="noreferrer">@anikks treats & trends · TikTok ↗</a></div></div></section>}
    </main>
    <footer className="footer"><a className="brand brand-footer" href="/"><span className="brand-mark">A<span>✦</span></span><span>ANIKKS<small>TREATS & TREND</small></span></a><span>Great finds. Everyday joy.</span><span>© {new Date().getFullYear()} ANIKKS Treats & Trend</span><a className="admin-link" href="/admin">Admin dashboard ↗</a><a href={"https://wa.me/"+WA}>Made with care ↗</a></footer>

    {cartOpen && <div className="drawer-backdrop" onClick={()=>{setCartOpen(false);setCheckout(false);}}><aside className="cart-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><small>YOUR ANIKKS BAG</small><h2>{checkout?"Delivery details":"Your good finds"} <em>({count})</em></h2></div><button onClick={()=>{setCartOpen(false);setCheckout(false);}}>✕</button></div>
      {!checkout ? <><div className="cart-items">{cartProducts.map(p=><div className="cart-row" key={p.id}><img src={publicImage(p.image_path)} alt=""/><div className="cart-item-info"><strong>{p.name}</strong><small>{money(p.price_ngn)}</small><div className="qty"><button onClick={()=>changeQty(p,-1)}>−</button><span>{cart[p.id]}</span><button onClick={()=>changeQty(p,1)}>＋</button></div></div><b>{money(p.price_ngn*cart[p.id])}</b></div>)}{!count && <div className="cart-empty">Your bag is waiting for something lovely.<br/><a href="#shop" onClick={()=>setCartOpen(false)}>Explore the store →</a></div>}</div><div className="drawer-total"><div><span>Subtotal</span><strong>{money(total)}</strong></div><small>Delivery fee and final availability will be confirmed by our team.</small><button className="btn btn-orange" disabled={!count} onClick={()=>setCheckout(true)}>Continue to checkout ↗</button></div></> :
      <form className="checkout-form" onSubmit={placeOrder}><p>Your order is securely saved before we open WhatsApp for confirmation.</p><label>Full name<input required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label><label>Phone number<input required type="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label><label>Delivery location<input required value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label><label>Order note (optional)<textarea value={customer.notes} onChange={e=>setCustomer({...customer,notes:e.target.value})}/></label><div className="checkout-total"><span>Order subtotal</span><strong>{money(total)}</strong></div><button className="btn btn-orange" type="submit">Place order & continue on WhatsApp ↗</button><button className="back-link" type="button" onClick={()=>setCheckout(false)}>← Back to bag</button></form>}
    </aside></div>}

    {adminOpen && <div className="drawer-backdrop admin-backdrop" onClick={()=>setAdminOpen(false)}><section className="admin-panel" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><small>ANIKKS · SECURE STORE TOOLS</small><h2>Store manager</h2></div><button onClick={()=>setAdminOpen(false)}>✕</button></div>
      {!isAdmin ? <form className="admin-login" onSubmit={signIn}><p>Sign in with your authorised administrator account.</p><label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="btn btn-orange" disabled={adminLoading}>{adminLoading?"Please wait…":"Secure administrator sign in"}</button><button className="back-link" type="button" disabled={adminLoading} onClick={registerInitialAdmin}>Set up the first administrator account</button><small>First-time setup is restricted to the authorised business email and requires email confirmation. Only the first administrator can claim this setup.</small></form> :
      <><div className="admin-stats"><div><small>ACTIVE PRODUCTS</small><strong>{products.length}</strong></div><div><small>RECENT ORDERS</small><strong>{orders.length}</strong></div><div><small>ORDER VALUE</small><strong>{money(orders.reduce((a,o)=>a+Number(o.total_ngn),0))}</strong></div></div>
      <div className="filters"><button className={tab==="products"?"active":""} onClick={()=>setTab("products")}>Products & stock</button><button className={tab==="orders"?"active":""} onClick={()=>{setTab("orders");loadOrders();}}>Orders</button><button onClick={signOut}>Sign out</button></div>
      {tab==="products" ? <>
        <form className="product-admin-form" onSubmit={saveProduct}><h3>{editing?"Edit product":"Add a product"}</h3><div className="admin-fields"><label>Product name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Food</option><option>Shades</option><option>Perfumes</option></select></label><label>Price (₦)<input required type="number" min="1" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Opening stock<input type="number" min="0" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label><label>Product label<input value={form.tag} onChange={e=>setForm({...form,tag:e.target.value})}/></label><label>Product image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImageFile(e.target.files?.[0] || null)}/></label><label className="wide-field">Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div><div className="admin-form-actions"><button className="btn btn-orange" disabled={adminLoading}>{adminLoading?"Saving…":editing?"Update product":"Save product"}</button>{editing&&<button className="back-link" type="button" onClick={()=>{setForm(emptyForm);setEditing(null);setImageFile(null);}}>Cancel</button>}</div></form>
        <div className="admin-list-head"><h3>Product catalogue & stock</h3></div><div className="admin-product-list">{products.map(p=><div key={p.id}><span><b>{p.name}</b><small>{p.category} · {money(p.price_ngn)} · Stock: {p.stock}</small></span><input aria-label={"Stock adjustment for "+p.name} type="number" placeholder="+/- qty" value={stockAdjust[p.id] || ""} onChange={e=>setStockAdjust({...stockAdjust,[p.id]:e.target.value})}/><button onClick={()=>updateStock(p)}>Adjust</button><button onClick={()=>editProduct(p)}>Edit</button><button onClick={()=>hideProduct(p.id)}>Hide</button></div>)}</div>
      </> : <><div className="admin-list-head"><h3>Recent customer orders</h3><button className="back-link" onClick={loadOrders}>Refresh</button></div>{orders.length ? orders.map(o=><div className="order-admin-row" key={o.id}><b>{o.order_number} · {money(o.total_ngn)}</b><small>{o.customer_name} · {o.phone} · {new Date(o.created_at).toLocaleString()}</small><small>{o.delivery_address}</small><small>{(o.order_items || []).map(i=>i.product_name+" × "+i.quantity).join(", ")}</small><label>Status <select value={o.status} onChange={e=>updateOrderStatus(o,e.target.value)}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="processing">Processing</option><option value="shipped">Shipped</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div>) : <p>No orders have been received yet.</p>}</>}
      </>}
    </section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </>;
}

createRoot(document.getElementById("root")).render(window.location.pathname === "/admin" || window.location.pathname === "/admin/" ? <AdminDashboard/> : <App/>);
