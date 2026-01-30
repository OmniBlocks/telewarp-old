import React from 'react'
import { createRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'

createInertiaApp({
  // 1. Resolve: Maps the 'component' string from Express to a file in /Pages
  resolve: name => {
    const pages = import.meta.glob('./Pages/**/*.jsx', { eager: true })
    return pages[`./Pages/${name}.jsx`]
  },

  // 2. Setup: Standard React mounting logic
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />)
  },

  // 3. The Future Flag: This is what tells Inertia to omit 'data-page' 
  // and look for the <script id="inertia-data"> tag instead.
  defaults: {
    future: {
      useScriptElementForInitialPage: true,
    },
  },
})