import React from 'react';

interface StatItem {
  label: string;
  value: string;
}

const App: React.FC = () => {
  const features: string[] = [
    'Server-side framework detection via React fiber nodes',
    'Client-side hydration with React 18 createRoot API',
    'CSS styling with external stylesheet',
    'Image resources for sub-resource download testing',
    'Multiple component sections with varied DOM structure',
  ];

  const stats: StatItem[] = [
    { label: 'Components', value: '5' },
    { label: 'Elements', value: '30+' },
    { label: 'Images', value: '3' },
    { label: 'Sections', value: '3' },
  ];

  return (
    <div id="app-container">
      <header className="app-header">
        <h1>React 18 SPA Application</h1>
        <p className="subtitle">End-to-End Test Fixture for Web-Clone</p>
      </header>

      <main className="app-content">
        <section className="card">
          <h2>Dashboard Overview</h2>
          <p>This React 18 SPA fixture contains multiple components with realistic DOM structure to test web-clone SPA crawling capabilities. The production build uses fiber-based hydration detection.</p>
          <div className="stats-grid">
            {stats.map((stat) => (
              <div className="stat-item" key={stat.label}>
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Key Features</h2>
          <ul className="feature-list">
            {features.map((feature, index) => (
              <li key={index}>
                <span className="feature-icon">&#10003;</span>
                {feature}
              </li>
            ))}
          </ul>
        </section>

        <section className="card image-section">
          <h2>Resources</h2>
          <div className="image-grid">
            {[1, 2, 3].map((i) => (
              <img
                key={i}
                src={`/assets/placeholder-${i}.svg`}
                alt={`Placeholder ${i}`}
                className="placeholder-img"
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} React 18 E2E Fixture. This page is designed to test web-clone SPA snapshot capabilities.</p>
      </footer>
    </div>
  );
};

export default App;
