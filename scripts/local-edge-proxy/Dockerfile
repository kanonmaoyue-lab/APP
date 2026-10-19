# Official Supabase edge-runtime v1.77.4 manifest digest; local development only.
FROM ghcr.io/supabase/edge-runtime@sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8
COPY edge-runtime /usr/local/lib/little-days/edge-runtime
RUN chmod 755 /usr/local/lib/little-days/edge-runtime
ENV PATH="/usr/local/lib/little-days:${PATH}"
LABEL org.opencontainers.image.base.digest="sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8"
