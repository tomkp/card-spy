import React from 'react';
import CommandResponse from './CommandResponse';
import SplitPane from 'react-split-pane';
import './commands.scss';



export default ({commands}) => {
    return (
        <SplitPane split="vertical" minSize="50" defaultSize="100">
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
            <div></div>
        </SplitPane>

    )
};