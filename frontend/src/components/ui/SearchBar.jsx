import React from 'react';
import { Search } from 'lucide-react';

const SearchBar = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative w-full ${className}`}>
    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
    <input
      type="text"
      className="w-full glass-input !pl-10 py-2.5 text-sm"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  </div>
);

export default SearchBar;
