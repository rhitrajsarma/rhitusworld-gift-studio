import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#1C1C1E', background: '#FAF9F6', minHeight: '100vh' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Frontend Runtime Error</h2>
                    <pre style={{ marginTop: '1rem', padding: '1rem', background: '#F3F1EC', borderRadius: '0.5rem', overflowX: 'auto', fontSize: '0.85rem' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);