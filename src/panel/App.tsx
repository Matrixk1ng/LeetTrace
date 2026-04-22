import { useTrace } from './store/TraceContext';
import './App.css';

/**
 * Main app layout for LeetTrace panel
 * ~350-400px wide, dark theme, three vertical sections:
 * 1. Header with title and pattern badge
 * 2. Controls bar with playback controls
 * 3. Visualization area (variable inspector for now)
 */
function App() {
  const { state, dispatch, currentSnapshot } = useTrace();

  const handlePlayClick = () => {
    dispatch({ type: 'PLAY' });
  };

  const handlePauseClick = () => {
    dispatch({ type: 'PAUSE' });
  };

  const handleResetClick = () => {
    dispatch({ type: 'RESET' });
  };

  const handleNextStep = () => {
    dispatch({ type: 'NEXT_STEP' });
  };

  const handlePrevStep = () => {
    dispatch({ type: 'PREV_STEP' });
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SPEED', payload: parseInt(e.target.value) });
  };

  return (
    <div className="min-h-screen bg-trace-bg-primary text-trace-text-primary flex flex-col">
      {/* Header Section */}
      <header className="bg-trace-bg-secondary border-b border-trace-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* LeetTrace Title with gradient icon */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-trace-accent to-purple-500 rounded-sm"></div>
              <h1 className="text-lg font-bold text-trace-text-primary">LeetTrace</h1>
            </div>
          </div>

          {/* Pattern Badge */}
          {state.detectedPattern && (
            <div className="px-3 py-1 bg-trace-bg-card border border-trace-border rounded-full text-xs">
              <span className="text-trace-text-secondary">
                {state.detectedPattern.type}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Controls Bar */}
      <div className="bg-trace-bg-card border-b border-trace-border px-4 py-3">
        <div className="space-y-3">
          {/* Playback Controls */}
          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={handleResetClick}
              className="px-2 py-1 text-xs font-medium text-trace-text-primary bg-trace-bg-secondary hover:bg-trace-border border border-trace-border rounded transition"
              title="Reset"
            >
              ⏮
            </button>
            <button
              onClick={handlePrevStep}
              className="px-2 py-1 text-xs font-medium text-trace-text-primary bg-trace-bg-secondary hover:bg-trace-border border border-trace-border rounded transition"
              title="Previous step"
            >
              ◀
            </button>
            {state.status === 'running' ? (
              <button
                onClick={handlePauseClick}
                className="px-3 py-1 text-xs font-medium text-white bg-trace-accent hover:bg-blue-400 rounded transition"
                title="Pause"
              >
                ⏸
              </button>
            ) : (
              <button
                onClick={handlePlayClick}
                disabled={state.status === 'completed'}
                className="px-3 py-1 text-xs font-medium text-white bg-trace-accent hover:bg-blue-400 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                title="Play"
              >
                ▶
              </button>
            )}
            <button
              onClick={handleNextStep}
              className="px-2 py-1 text-xs font-medium text-trace-text-primary bg-trace-bg-secondary hover:bg-trace-border border border-trace-border rounded transition"
              title="Next step"
            >
              ▶▶
            </button>
          </div>

          {/* Step Counter and Speed Control */}
          <div className="flex items-center justify-between text-xs text-trace-text-secondary">
            <div>
              Step {state.currentStep} / {state.totalSteps}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="speed" className="text-xs">
                Speed:
              </label>
              <input
                id="speed"
                type="range"
                min="50"
                max="2000"
                step="50"
                value={state.speed}
                onChange={handleSpeedChange}
                className="w-20 h-1 bg-trace-bg-secondary rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visualization Area */}
      <div className="flex-1 overflow-y-auto bg-trace-bg-primary px-4 py-4">
        {state.status === 'error' && (
          <div className="bg-red-900 bg-opacity-20 border border-red-700 text-red-200 px-3 py-2 rounded text-xs mb-4">
            {state.error}
          </div>
        )}

        {state.snapshots.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-trace-text-muted">
              <p className="text-sm">No code executed yet</p>
              <p className="text-xs mt-1">Extract and execute code from LeetCode</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Variable Inspector */}
            <div className="bg-trace-bg-card border border-trace-border rounded p-3">
              <h2 className="text-sm font-semibold text-trace-text-primary mb-2">
                Variables
              </h2>
              {currentSnapshot ? (
                <div className="space-y-2">
                  {Object.entries(currentSnapshot.variables).map(
                    ([name, variable]) => (
                      <div
                        key={name}
                        className={`text-xs p-2 rounded bg-trace-bg-secondary border ${
                          variable.changed
                            ? 'border-trace-accent'
                            : 'border-trace-border'
                        }`}
                      >
                        <div className="font-mono font-semibold text-trace-accent">
                          {name}
                        </div>
                        <div className="text-trace-text-secondary">
                          {variable.type}
                        </div>
                        <div className="text-trace-text-primary mt-1 font-mono">
                          {JSON.stringify(variable.value)}
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="text-xs text-trace-text-muted">
                  No snapshot data
                </div>
              )}
            </div>

            {/* Data Structures (placeholder for visualizers) */}
            {currentSnapshot?.dataStructures.length ? (
              <div className="bg-trace-bg-card border border-trace-border rounded p-3">
                <h2 className="text-sm font-semibold text-trace-text-primary mb-2">
                  Data Structures
                </h2>
                <div className="text-xs text-trace-text-muted">
                  Visualizers coming soon (Arrays, HashMaps, Linked Lists, Trees)
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
