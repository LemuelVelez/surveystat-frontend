FROM node:22.13.0-alpine AS build

WORKDIR /app

ARG SurveyStat_URL
ARG VITE_SURVEYSTAT_URL
ARG VITE_ACREDIFY_SYSTEM_URL
ARG VITE_SYSTEM_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN if [ -z "${VITE_SURVEYSTAT_URL:-}" ] && [ -n "${SurveyStat_URL:-}" ]; then export VITE_SURVEYSTAT_URL="$SurveyStat_URL"; fi \
    && npm run build

FROM nginx:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]