const express = require('express')
const path = require('path')
const fs = require('fs')
const { ClassicLevel } = require('classic-level')
const { inertia } = require('@inertiajs/node')

const app = express()
const PORT = process.env.PORT || 3000
const isProd = !Boolean(process.env.DEVELOPMENT)

/* =========================
   DATABASE
   ========================= */
const dbPath = path.join(__dirname, 'leveldb')
const db = new ClassicLevel(dbPath, { valueEncoding: 'json' })

;(async () => {
  try {
    await db.open()
    console.log('✔ Database opened')
  } catch (err) {
    console.error('✖ Failed to open database:', err)
    process.exit(1)
  }
})()

/* =========================
   MIDDLEWARE & INERTIA
   ========================= */
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.set('trust proxy', true)
app.set('x-powered-by', false)

// Inertia Setup
app.use(inertia({
  rootView: 'app.ejs', // This file should contain the <script id="inertia-data">
}))

app.use(express.static(path.join(__dirname, 'static')))
app.use('/js', express.static(path.join(__dirname, 'frontend/dist/assets'))) // Point to Vite build

/* =========================
   AUTH MIDDLEWARE
   ========================= */
app.use(async (req, res, next) => {
  req.user = null
  const cookieHeader = req.headers.cookie
  if (cookieHeader) {
    const token = cookieHeader
      .split(';')
      .find(c => c.trim().startsWith('tw_session='))
      ?.split('=')[1]

    if (token) {
      try {
        const session = await db.get(`session:${token}`)
        if (Date.now() < session.expires) {
          const userData = await db.get(`user:${session.username.toLowerCase()}`)
          req.user = {
            username: userData.username,
            avatarUrl: `/api/user-api?action=get&user=${userData.username}&type=image`
          }
        }
      } catch (err) {}
    }
  }
  next()
})

/* =========================
   API ROUTES LOADER
   ========================= */
const walkApi = (dir, baseRoute = '') => {
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file)
    if (fs.statSync(fullPath).isDirectory()) {
      walkApi(fullPath, path.join(baseRoute, file))
      continue
    }
    let routePath = '/api' + (file === 'index.js' ? baseRoute || '/' : path.join(baseRoute, file.replace('.js', '')))
    routePath = routePath.replace(/\[(.+?)\]/g, ':$1').replace(/\\/g, '/')

    app.all(routePath, async (req, res, next) => {
      try {
        const handler = require(fullPath)
        if (typeof handler === 'function') await handler(req, res, db)
        else res.status(500).json({ error: 'Invalid API module' })
      } catch (err) { next(err) }
    })
  }
}

/* =========================
   INERTIA VIEW LOADER
   ========================= */
// This replaces your EJS walkViews. It maps folders to React Components.
function walkViews(dir, baseRoute = '') {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    if (!fs.statSync(fullPath).isDirectory() || entry.startsWith('_')) continue

    let segment = entry.replace(/\[(.+?)\]/g, ':$1')
    let routePath = entry === 'index' ? (baseRoute || '/') : path.join(baseRoute, segment)
    routePath = '/' + routePath.replace(/\\/g, '/').replace(/\/+$/, '')
    if (routePath === '') routePath = '/'

    const serverFile = path.join(fullPath, 'page.server.js')
    
    // We assume the React component name matches the folder name (e.g., /profile -> Profile.jsx)
    const componentName = entry.charAt(0).toUpperCase() + entry.slice(1).replace(/\[|\]/g, '')

    app.get(routePath, async (req, res, next) => {
      try {
        let props = { user: req.user, params: req.params }
        
        if (fs.existsSync(serverFile)) {
          delete require.cache[require.resolve(serverFile)]
          const mod = require(serverFile)
          const data = typeof mod === 'function' ? await mod(req.params, req, db) : mod
          props = { ...props, ...data }
        }

        // The "Magic" call: componentName maps to your file in frontend/Pages/
        res.Inertia.render(componentName, props)
      } catch (err) { next(err) }
    })

    walkViews(fullPath, routePath)
  }
}

/* =========================
   INIT + START
   ========================= */
walkApi(path.join(__dirname, 'api'))
walkViews(path.join(__dirname, 'views'))

app.listen(PORT, () => {
  console.log(`🚀 TeleWarp running with Inertia at http://localhost:${PORT}`)
})