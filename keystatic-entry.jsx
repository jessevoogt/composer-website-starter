import React from 'react'
import { createRoot } from 'react-dom/client'
import { makePage } from '@keystatic/astro/ui'
import config from './keystatic.config.ts'
const Page = makePage(config)
createRoot(document.getElementById('root')).render(React.createElement(Page))
