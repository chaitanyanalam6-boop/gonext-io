import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './AuthContext.tsx'
import { ThemeProvider } from './ThemeContext.tsx'
import { CurrencyProvider } from './CurrencyContext.tsx'
import 'leaflet/dist/leaflet.css';


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
