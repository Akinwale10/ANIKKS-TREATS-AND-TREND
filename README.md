# ANIKKS Treats & Trend

A responsive React + Vite storefront for ANIKKS Treats & Trend.

## Brand and contact
- Deep olive: `#24310B`
- Vibrant orange: `#FF8500`
- Cream: `#FFFCEF`
- Locations: Ifo and Ilaro, Ogun State, Nigeria
- WhatsApp: +234 916 225 9886
- Phone: +234 812 470 5254

## Current features
- Responsive storefront and mobile navigation
- Food, shades and perfume product catalogue
- Product search, category filters and sorting
- Product cards, stock labels and wishlist
- Shopping bag with quantity and stock-limit controls
- Checkout form with customer contact and delivery location
- WhatsApp order hand-off with order summary
- Local order history and JSON export
- Store manager screen for adding, editing and hiding products
- Basic local dashboard metrics
- Moniepoint and business support information
- About, contact and social links

## Run locally
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

## Important production limitations
This version is a functional frontend demonstration. The catalogue, wishlist, cart and manager data are stored in the visitor's browser using localStorage. The manager PIN is a local demo gate, not secure authentication. Local orders only exist in the browser where they were created. WhatsApp checkout sends the order details to the business for confirmation; no card/transfer payment gateway is integrated.

Before accepting real online orders at scale, connect a hosted database and secure authentication (for example Supabase), enforce server-side stock and order validation, implement role-based admin access, configure image storage, and integrate a payment provider if online payments are required. Replace sample product names, photos, prices and stock with verified business inventory.
