"use client"

import * as React from "react"

// Simple tooltip implementation without external dependencies
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <div className="relative inline-block">{children}</div>
}

export function TooltipTrigger({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) {
  return <>{children}</>
}

export function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity">
      {children}
    </div>
  )
}