'use client'

import { useEffect, useState } from 'react'

type RatingPoint = {
  date: string
  rating: number
  matchId: string
  ratingDeviation?: number
  confidenceLevel?: number
}

type RatingChartProps = {
  ratingHistory: RatingPoint[]
  showConfidenceInterval?: boolean
}

export default function RatingChart({ ratingHistory, showConfidenceInterval = false }: RatingChartProps) {
  const [dimensions, setDimensions] = useState({ width: 400, height: 200 })

  useEffect(() => {
    const updateDimensions = () => {
      const containerWidth = Math.min(window.innerWidth - 64, 600) // 64px for padding, max 600px
      const height = Math.max(180, Math.min(containerWidth * 0.45, 280)) // Slightly smaller for mobile
      setDimensions({ width: containerWidth, height })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])
  if (ratingHistory.length === 0) {
    return (
      <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-lg font-medium">No rating history yet</div>
          <div className="text-sm">Play some matches to see your rating progress!</div>
        </div>
      </div>
    )
  }

  // Sort by date to ensure proper line drawing
  const sortedHistory = [...ratingHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  const { width, height } = dimensions
  
  // Calculate chart dimensions  
  const leftPadding = Math.max(35, width * 0.08) // Responsive left padding for Y-axis labels
  const rightPadding = 20
  const topPadding = 20
  const bottomPadding = 20
  const chartWidth = width - leftPadding - rightPadding
  const chartHeight = height - topPadding - bottomPadding
  
  // Find min and max ratings for scaling (including confidence intervals if shown)
  const ratings = sortedHistory.map(point => point.rating)
  let minRating = Math.min(...ratings)
  let maxRating = Math.max(...ratings)
  
  // If showing confidence intervals, adjust range to include them
  if (showConfidenceInterval) {
    sortedHistory.forEach(point => {
      if (point.ratingDeviation) {
        // 95% confidence interval is approximately ±2 standard deviations
        const interval = 2 * point.ratingDeviation
        minRating = Math.min(minRating, point.rating - interval)
        maxRating = Math.max(maxRating, point.rating + interval)
      }
    })
  }
  
  // Add some padding to the rating range
  const ratingRange = maxRating - minRating
  const paddedMin = Math.max(1000, minRating - ratingRange * 0.1)
  const paddedMax = Math.min(2500, maxRating + ratingRange * 0.1)
  const adjustedRange = paddedMax - paddedMin
  
  // Convert data points to SVG coordinates
  const points = sortedHistory.map((point, index) => {
    // For single point, center it
    const x = sortedHistory.length === 1 
      ? leftPadding + chartWidth / 2 
      : leftPadding + (index / (sortedHistory.length - 1)) * chartWidth
    const y = topPadding + chartHeight - ((point.rating - paddedMin) / adjustedRange) * chartHeight
    
    // Calculate confidence interval bounds if RD is available
    let upperBound = y
    let lowerBound = y
    if (showConfidenceInterval && point.ratingDeviation) {
      const interval = 2 * point.ratingDeviation // 95% confidence interval
      upperBound = topPadding + chartHeight - ((point.rating + interval - paddedMin) / adjustedRange) * chartHeight
      lowerBound = topPadding + chartHeight - ((point.rating - interval - paddedMin) / adjustedRange) * chartHeight
    }
    
    return { x, y, upperBound, lowerBound, ...point }
  })
  
  // Create path string for the line
  const pathData = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`
    }
    return `${path} L ${point.x} ${point.y}`
  }, '')
  
  // Generate Y-axis labels
  const yAxisLabels = []
  const labelCount = 5
  for (let i = 0; i < labelCount; i++) {
    const value = paddedMin + (adjustedRange * i) / (labelCount - 1)
    const y = topPadding + chartHeight - (i / (labelCount - 1)) * chartHeight
    yAxisLabels.push({ value: Math.round(value), y })
  }

  return (
    <div className="w-full flex justify-center">
      <svg width={width} height={height} className="overflow-visible">
        {/* Y-axis labels */}
        {yAxisLabels.map((label, index) => (
          <text
            key={index}
            x={leftPadding - 8}
            y={label.y}
            textAnchor="end"
            className="text-xs fill-gray-500"
            dominantBaseline="middle"
          >
            {label.value}
          </text>
        ))}
        
        {/* Grid lines */}
        {yAxisLabels.map((label, index) => (
          <line
            key={index}
            x1={leftPadding}
            y1={label.y}
            x2={leftPadding + chartWidth}
            y2={label.y}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}
        
        {/* Confidence interval area */}
        {showConfidenceInterval && points.some(p => p.ratingDeviation) && (
          <path
            d={`
              ${points.reduce((path, point, index) => {
                if (index === 0) {
                  return `M ${point.x} ${point.upperBound}`
                }
                return `${path} L ${point.x} ${point.upperBound}`
              }, '')}
              ${points.reduceRight((path, point, index) => {
                if (index === points.length - 1) {
                  return `L ${point.x} ${point.lowerBound}`
                }
                return `${path} L ${point.x} ${point.lowerBound}`
              }, '')}
              Z
            `}
            fill="#f97316"
            fillOpacity="0.15"
            stroke="none"
          />
        )}
        
        {/* Confidence interval bounds lines */}
        {showConfidenceInterval && points.some(p => p.ratingDeviation) && (
          <>
            <path
              d={points.reduce((path, point, index) => {
                if (index === 0) {
                  return `M ${point.x} ${point.upperBound}`
                }
                return `${path} L ${point.x} ${point.upperBound}`
              }, '')}
              fill="none"
              stroke="#f97316"
              strokeWidth="1"
              strokeOpacity="0.3"
              strokeDasharray="3 3"
            />
            <path
              d={points.reduce((path, point, index) => {
                if (index === 0) {
                  return `M ${point.x} ${point.lowerBound}`
                }
                return `${path} L ${point.x} ${point.lowerBound}`
              }, '')}
              fill="none"
              stroke="#f97316"
              strokeWidth="1"
              strokeOpacity="0.3"
              strokeDasharray="3 3"
            />
          </>
        )}
        
        {/* Rating line */}
        <path
          d={pathData}
          fill="none"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {points.map((point) => (
          <g key={point.matchId}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#f97316"
              stroke="white"
              strokeWidth="2"
              className="hover:r-6 cursor-pointer transition-all"
            />
            {/* Tooltip on hover */}
            <title>{`${point.matchId.includes('snapshot') ? 'Week' : 'Match'} ${sortedHistory.findIndex(p => p.matchId === point.matchId) + 1}: Rating ${Math.round(point.rating)}${point.confidenceLevel ? ` (${point.confidenceLevel.toFixed(0)}% confidence)` : ''} - ${new Date(point.date).toLocaleDateString()}`}</title>
          </g>
        ))}
        
      </svg>
    </div>
  )
}