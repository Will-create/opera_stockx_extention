const originalFetch = window.fetch;
const middlewares = [];
function useFetchMiddleware(fn) {
  middlewares.push(fn);
}
window.fetch = async function(input, init = {}) {
  let req = {
    input,
    init: { ...init, headers: new Headers(init.headers || {}) }
  };

  const compose = (middlewares) => {
    return async function(req) {
      let index = -1;

      const dispatch = async (i) => {
        if (i <= index) throw new Error('next() called multiple times');
        index = i;
        const fn = middlewares[i];
        if (!fn) return await originalFetch(req.input, req.init);

        return await fn(req, () => dispatch(i + 1));
      };

      return await dispatch(0);
    };
  };

  const fnMiddleware = compose(middlewares);
  return await fnMiddleware(req);
};



useFetchMiddleware(async (req, next) => {
    console.log('➡️ Request to:', req.input);
    const response = await next(req);
    console.log('⬅️ Response from:', req.input, 'Status:', response.status);
    return response;
  });
  
  useFetchMiddleware(async (req, next) => {
    const response = await next(req);
  
    if (response.status === 401) {
      console.warn('🔐 Unauthorized. Maybe refresh token?');
      // Potential auto-refresh logic
    }
  
    if (req.input.includes('/api/p/e')) {
      const cloned = response.clone();
      const data = await cloned.json();
      console.log('🎯 Special route payload:', data);
    }
  
    return response;
  });
  