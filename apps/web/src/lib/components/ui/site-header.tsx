import { Separator } from '~/lib/components/ui/separator'
import { SidebarTrigger, useSidebar } from '~/lib/components/ui/sidebar'
import { ThemeToggle } from '~/lib/components/theme-toggle'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { getStockTickerData } from '~/lib/utils/get-db-data'

// Add CSS animation keyframes
const scrollKeyframes = `
  @keyframes scroll-left {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-100%);
    }
  }
`

// Inject the keyframes into the document head
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = scrollKeyframes
  document.head.appendChild(style)
}

function StockTicker() {
  const { data: tickerData = [], isLoading } = useQuery({
    queryKey: ['ticker-data'],
    queryFn: () => getStockTickerData(),
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  // Calculate animation duration based on content width for consistent visual speed
  // Base duration for a 600px wide ticker (adjust as needed)
  const baseWidth = 600
  const baseDuration = 22 // seconds
  const [containerWidth, setContainerWidth] = useState(baseWidth)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Calculate duration so visual speed is consistent across screen sizes
  const duration = (containerWidth / baseWidth) * baseDuration

  if (isLoading || tickerData.length === 0) {
    return <div className="text-base font-medium">Bot Trading Simulator</div>
  }

  // Create a repeated array for continuous scrolling (repeat enough times to fill the width)
  const repeatedData = Array.from({ length: 10 }, () => tickerData).flat()

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden">
      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />

      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

      {/* Scrolling content */}
      <div
        className="flex"
        style={{
          animation: `scroll-left ${duration}s linear infinite`,
        }}
      >
        {repeatedData.map((stock, index) => {
          const isPositive = stock.percentChange >= 0
          return (
            <div key={`${stock.symbol}-${index}`} className="flex items-center gap-2 text-base font-medium whitespace-nowrap px-2">
              <span className="text-muted-foreground">{stock.symbol}</span>
              <span>${stock.currentPrice.toFixed(2)}</span>
              <span className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{stock.percentChange.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export function SiteHeader() {
  const { state, isMobile } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <header className={`h-12 flex shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear ${isMobile || isCollapsed ? 'max-w-none' : 'max-w-[calc(100vw-12.8rem)]'}`}>
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <StockTicker />
        <ThemeToggle className="ml-auto" />
      </div>
    </header>
  )
}
