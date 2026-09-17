import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import DailyOrders from '../../src/components/DailyOrders'
import '../../src/styles/index.css'

// The browser check intercepts the data hook and all external requests.
// This renders the real page, filters, summaries, dialogs and navigation.
createRoot(document.getElementById('root')).render(
  <BrowserRouter><DailyOrders user={{ id: 'ui-test-admin' }} loading={false} /></BrowserRouter>
)
