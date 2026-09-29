import { Component } from 'react';
import ErrorPage from '../pages/ErrorPage';

/**
 * Catches render errors below it and shows a friendly page instead of a blank screen.
 * Changing `resetKey` (e.g. the route path) clears the error so navigation recovers.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (this.props.onError) this.props.onError(error, info);
    else console.error('Unhandled UI error', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.reset();
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <ErrorPage error={this.state.error} onRetry={this.reset} />;
    return this.props.children;
  }
}
