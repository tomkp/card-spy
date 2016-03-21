import React from 'react';
import { Link } from 'react-router';
import './results.scss';

export default ({result}) => {
    return (
        <div className="result">
            <Link to={`/result/${result.id}`} activeClassName="active">
                {result.name}
            </Link>
        </div>

    )
};