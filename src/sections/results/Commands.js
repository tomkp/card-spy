import React from 'react';
import Command from './Command';
import './commands.scss';



export default ({commands}) => {
    return (
        <div className="commands">
            { commands.map((result, key) => {
                return <Command key={key}
                                command={result.command}
                                response={result.response} />
            })
            }
        </div>
    )
};