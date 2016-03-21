import React from 'react';
import { Link } from 'react-router';
import './header.scss';
import SearchBar from './searchbar/SearchBar';

export default () => {
    return (
        <div className="header">
            <div className="row">
                <Link to={`/`} className="logo">⍟</Link>
                <div className="flex"></div>
                <SearchBar />
            </div>
        </div>
    )
};
