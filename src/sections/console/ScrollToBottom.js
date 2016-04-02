import React from 'react';
import ReactDOM from 'react-dom';
import './scroll-to-bottom.scss';

export default class extends React.Component {

    componentWillUpdate() {
        var node = ReactDOM.findDOMNode(this);
        this.shouldScrollBottom = node.scrollTop + node.offsetHeight === node.scrollHeight;
    };

    componentDidUpdate() {
        if (this.shouldScrollBottom) {
            var node = ReactDOM.findDOMNode(this);
            node.scrollTop = node.scrollHeight
        }
    };

    render() {
        return <div className={`scroll-to-bottom ${this.props.className}`}>{this.props.children}</div>;
    }
};