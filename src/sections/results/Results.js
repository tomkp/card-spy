import React from 'react';
import Result from './Result';
import './results.scss';



export default ({results, selectResult}) => {
    return (
        <div className="results">
            { results.map(result => <Result key={result.id} result={result} selectResult={selectResult} /> )}
        </div>
    )
};