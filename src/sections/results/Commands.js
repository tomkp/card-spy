import React from 'react';
import CommandResponse from './CommandResponse';
import SplitPane from 'react-split-pane';
import './commands.scss';
import {Layout, Fixed, Flex} from 'react-layout-pane';


const ApplicationId = ({id}) => { return <li className="aid">{id}</li>};


export default ({commands, ids, clear}) => {
    return (
        <SplitPane split="vertical" minSize="50" defaultSize="400">
            <Layout type="column">
                <Fixed className="commands-control"><button onClick={clear}>Clear</button></Fixed>
                <Flex className="commands">
                    { commands.map((result, key) => {
                        return <CommandResponse key={key}
                                                command={result.command}
                                                ok={result.ok}
                                                meaning={result.meaning}
                                                response={result.response} />
                        })
                    }
                </Flex>
            </Layout>
            <ul className="aids">
                {ids.map((id, key) => <ApplicationId id={id} key={key} />)}
            </ul>
        </SplitPane>

    )
};