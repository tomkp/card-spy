import React from 'react';
import CommandResponse from './CommandResponse';
import './commands.scss';



export default ({commands}) => {
    return (
        <div className="commands">
            { commands.map((result, key) => {
                return <CommandResponse key={key}
                                command={result.command}
                                ok={result.ok}
                                meaning={result.meaning}
                                response={result.response} />
            })
            }
        </div>
    )
};