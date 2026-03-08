import { ApolloProvider } from '@apollo/client/react';
import { Routes, Route } from 'react-router-dom';
import { client } from './graphql/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { ScanDetails } from './pages/ScanDetails';
import './App.css';

export function App() {
  return (
    <ErrorBoundary>
      <ApolloProvider client={client}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan/:scanId" element={<ScanDetails />} />
        </Routes>
      </ApolloProvider>
    </ErrorBoundary>
  );
}
