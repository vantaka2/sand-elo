'use client'

import { useState } from 'react'

export default function RatingInfo() {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowInfo(true)}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-bold transition-colors"
        aria-label="Rating information"
      >
        ?
      </button>

      {showInfo && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={() => setShowInfo(false)}
          />
          
          {/* Modal */}
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto bg-white rounded-lg shadow-xl z-50 max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900">How Ratings Work</h2>
                <button
                  onClick={() => setShowInfo(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 text-sm text-gray-600">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">🎯 The Glicko-2 Rating System</h3>
                  <p>
                    SandScore uses the advanced Glicko-2 rating system with time-weighted recency bias. 
                    This tracks your skill level, confidence in that rating, and gives more weight to recent performance.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">📊 How It's Calculated</h3>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Everyone starts at 1500 rating with 350 rating deviation</li>
                    <li>Win against stronger opponents = bigger rating gain</li>
                    <li>Recent matches (last 6 months) have more impact than older ones</li>
                    <li>Your rating deviation shows uncertainty - lower is more confident</li>
                    <li>Confidence percentage = 100% - (deviation/350 × 100%)</li>
                    <li>More recent games = higher confidence in your rating</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">🔄 The Calculation Process</h3>
                  <p>
                    To ensure maximum accuracy, ratings use an advanced iterative process:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>All matches are processed in chronological order</li>
                    <li>The system runs 10 complete passes through all matches</li>
                    <li>Time weighting: matches have 50% impact after 6 months</li>
                    <li>Each iteration refines ratings based on all other players' changes</li>
                    <li>Final ratings reflect interconnected skill relationships</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">⏱️ Update Schedule</h3>
                  <p className="text-orange-600 font-medium">
                    Important: Ratings are updated every few days, not instantly after matches.
                  </p>
                  <p className="mt-1">
                    This allows the system to process all matches together and maintain consistency across all players.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">👥 Team Ratings</h3>
                  <p className="text-blue-600 font-medium mb-2">
                    Coming Soon! Team ratings are currently under development.
                  </p>
                  <p>
                    Team ratings will track partnership chemistry separately from individual skills, 
                    using the same Glicko-2 system to show how well specific player combinations perform together.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowInfo(false)}
                className="mt-6 w-full bg-orange-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-orange-600 transition"
              >
                Got it!
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}