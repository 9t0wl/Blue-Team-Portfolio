import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import Home from './pages/Home';
import WriteupPage from './pages/WriteupPage';
import './styles/global.css';

export default function App() {
  return (
    <BrowserRouter basename="/Blue-Team-Portfolio">
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/case/:id" element={<WriteupPage type="case" />} />
      </Routes>
    </BrowserRouter>
  );
}
