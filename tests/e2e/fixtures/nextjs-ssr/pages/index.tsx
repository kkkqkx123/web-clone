import React from 'react';

interface StatItem {
  label: string;
  value: string;
}

export default function Home() {
  const features: string[] = [
    'Static site generation with Next.js export',
    'Client-side hydration with __NEXT_DATA__',
    'CSS Modules for scoped styling',
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
    <div className="app-container">
      <header className="app-header">
        <h1>Next.js SSR Application</h1>
        <p className="subtitle">End-to-End Test Fixture for Web-Clone</p>
      </header>

      <main className="app-content">
        <section className="card">
          <h2>Dashboard Overview</h2>
          <p>This Next.js SSR fixture contains multiple components with realistic DOM structure to test web-clone SPA crawling capabilities. It uses static export for pre-rendered output with __NEXT_DATA__ hydration payload.</p>
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
        <p>&copy; {new Date().getFullYear()} Next.js SSR E2E Fixture. This page is designed to test web-clone SPA snapshot capabilities.</p>
      </footer>

      <style jsx>{`
        .app-container { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
        .app-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; }
        .app-header h1 { color: #000; font-size: 28px; }
        .subtitle { color: #666; font-size: 16px; }
        .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h2 { color: #0070f3; margin-top: 0; }
        .stats-grid { display: flex; gap: 15px; margin-top: 15px; flex-wrap: wrap; }
        .stat-item { background: #f5f5f5; border-radius: 6px; padding: 12px 20px; text-align: center; min-width: 100px; }
        .stat-value { display: block; font-size: 24px; font-weight: bold; color: #0070f3; }
        .stat-label { display: block; font-size: 12px; color: #666; margin-top: 4px; }
        .feature-list { list-style: none; padding: 0; }
        .feature-list li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .feature-icon { color: #4caf50; margin-right: 8px; }
        .image-grid { display: flex; gap: 15px; flex-wrap: wrap; margin-top: 15px; }
        .placeholder-img { width: 180px; height: 120px; object-fit: contain; border: 1px solid #e0e0e0; border-radius: 4px; }
        .app-footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #999; font-size: 13px; }
      `}</style>
    </div>
  );
}
