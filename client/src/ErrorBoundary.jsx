import { Component } from "react";
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return <pre style={{padding:16,whiteSpace:"pre-wrap"}}>
{String(this.state.error?.message || this.state.error)}
{this.state.error?.stack ? "\n\n"+this.state.error.stack : ""}
      </pre>;
    }
    return this.props.children;
  }
}
