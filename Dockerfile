FROM ubuntu:24.04 AS build

RUN apt-get update && apt-get install -y \
    curl \
    git \
    nodejs \
    npm \
    nginx \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
    
WORKDIR /app

RUN npm install -g yarn

COPY . /app

WORKDIR /app/taxonium_backend
RUN yarn install

COPY dashboard/dist /usr/share/nginx/html
    
# Copy nginx config
COPY nginx/nginx-react.conf /etc/nginx/sites-available/default
    

ENV PROJECT_NAME='SARS_COV_2_real'
ENV NODE_MEMORY_LIMIT=4096

# Expose NGINX port
EXPOSE 80

COPY start.sh /usr/local/bin/start.sh 
RUN chmod +x /usr/local/bin/start.sh 
CMD ["/usr/local/bin/start.sh"]
