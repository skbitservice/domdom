# DOMDOM — Master Backend Specification

> **Version:** 1.0.0  
> **Last Updated:** 2026-10-06  
> **Status:** Production-Ready Specification  
> **Platform:** Instagram-Level Social Media Platform

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Database ER Diagram](#3-database-er-diagram)
4. [Database Tables — Complete Schema](#4-database-tables--complete-schema)
5. [API Endpoints](#5-api-endpoints)
6. [WebSocket Events](#6-websocket-events)
7. [Storage Architecture](#7-storage-architecture)
8. [Permissions & Roles](#8-permissions--roles)
9. [Notification Events](#9-notification-events)
10. [Feed / Recommendation Algorithm](#10-feed--recommendation-algorithm)
11. [Feature Flags](#11-feature-flags)
12. [Event Tracking / Analytics](#12-event-tracking--analytics)
13. [Safety & Moderation](#13-safety--moderation)
14. [Monetization System](#14-monetization-system)
15. [Shopping / Business](#15-shopping--business)
16. [Copyright System](#16-copyright-system)
17. [Multi-language / i18n](#17-multi-language--i18n)
18. [Data Management](#18-data-management)
19. [System-Level Production Features](#19-system-level-production-features)
20. [Admin Panel](#20-admin-panel)
21. [Universal Sharing & Deep Links](#21-universal-sharing--deep-links)
22. [API Versioning](#22-api-versioning)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ iOS App  │  │Android   │  │ Web App  │  │ Desktop  │           │
│  │ (Swift)  │  │(Kotlin)  │  │(Next.js) │  │(Electron)│           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       └──────────────┴──────────────┴──────────────┘                │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │   CDN (CloudFlare)│                            │
│                    └─────────┬─────────┘                            │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│                        API GATEWAY LAYER                            │
│                    ┌─────────▼─────────┐                            │
│                    │  Kong / AWS API   │  ← Rate Limiting, Auth     │
│                    │     Gateway       │    Request Routing          │
│                    └─────────┬─────────┘                            │
│                              │                                       │
│              ┌───────────────┼───────────────┐                      │
│              │               │               │                      │
│       ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐               │
│       │  REST API   │ │WebSocket  │ │  GraphQL    │               │
│       │  (Express/  │ │ Gateway   │ │  (Optional) │               │
│       │   Fastify)  │ │(Socket.io)│ │             │               │
│       └──────┬──────┘ └─────┬─────┘ └──────┬──────┘               │
│              │               │               │                      │
│              └───────────────┼───────────────┘                      │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │  Load Balancer    │                            │
│                    │  (Nginx/HAProxy)  │                            │
│                    └─────────┬─────────┘                            │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│                      SERVICE LAYER (Microservices)                  │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  User    │ │  Post    │ │  Reel    │ │  Story   │ │   DM     │ │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │ Service  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       │            │            │            │            │        │
│  ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ │
│  │  Audio   │ │  Live    │ │  Search  │ │  Notif   │ │  Shop    │ │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │ Service  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       │            │            │            │            │        │
│  ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ │
│  │  Admin   │ │  Safety  │ │  Analyt- │ │  Monet-  │ │  Copy-   │ │
│  │ Service  │ │ Service  │ │  ics     │ │  ization │ │  right   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Message Queue (RabbitMQ / Apache Kafka)          │  │
│  │     ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │  │
│  │     │  Email  │  │  Push   │  │  Video  │  │  Index  │      │  │
│  │     │  Queue  │  │  Queue  │  │  Queue  │  │  Queue  │      │  │
│  │     └─────────┘  └─────────┘  └─────────┘  └─────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│                        DATA LAYER                                  │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │PostgreSQL│ │  Redis   │ │Elastic-  │ │  MinIO   │ │  Click-  │ │
│  │(Primary) │ │ (Cache/  │ │ search   │ │  (S3     │ │  House   │ │
│  │          │ │  Session)│ │(Search)  │ │  Compat) │ │(Analytics│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │  MongoDB │ │  Kafka   │ │  FFmpeg  │ │  Prometheus│             │
│  │(Logs/    │ │(Event    │ │(Video    │ │  + Grafana│             │
│  │ Analytics│ │ Stream)  │ │Transcode)│ │(Monitoring│             │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **API Framework** | Node.js + Fastify / Express | REST API |
| **WebSocket** | Socket.io / ws | Real-time communication |
| **Primary DB** | PostgreSQL 16 | Relational data |
| **Cache** | Redis 7 | Sessions, rate limiting, feed cache |
| **Search** | Elasticsearch 8 | Full-text search, discovery |
| **Object Storage** | MinIO / AWS S3 | Media files (images, videos) |
| **Video Processing** | FFmpeg | Transcoding, thumbnails |
| **Message Queue** | RabbitMQ / Kafka | Background jobs |
| **Analytics DB** | ClickHouse | Event tracking, analytics |
| **Monitoring** | Prometheus + Grafana | Metrics, alerting |
| **Error Tracking** | Sentry | Error monitoring |
| **CDN** | CloudFlare / AWS CloudFront | Content delivery |
| **Load Balancer** | Nginx / HAProxy | Traffic distribution |
| **Container** | Docker + Kubernetes | Deployment, scaling |
| **CI/CD** | GitHub Actions | Automated deployment |

---

## 3. Database ER Diagram

```mermaid
erDiagram
    USERS ||--o{ POSTS : creates
    USERS ||--o{ REELS : creates
    USERS ||--o{ STORIES : creates
    USERS ||--o{ COMMENTS : writes
    USERS ||--o{ MESSAGES : sends
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ FOLLOWS : "follows/followed_by"
    USERS ||--o{ CLOSE_FRIENDS : "has/close_friend_of"
    USERS ||--o{ NOTES : creates
    USERS ||--o{ LIVE_STREAMS : hosts
    USERS ||--o{ PRODUCTS : sells
    USERS ||--o{ ORDERS : places
    USERS ||--o{ SUBSCRIPTIONS : "subscribes_to/subscriber"
    USERS ||--o{ WALLETS : owns
    USERS ||--o{ COPYRIGHT_REPORTS : files
    USERS ||--o{ REPORTS : files
    USERS ||--o{ BLOCKS : "blocks/blocked_by"
    USERS ||--o{ RESTRICTS : "restricts/restricted_by"
    USERS ||--o{ SESSIONS : has
    USERS ||--o{ AUDIT_LOGS : generates

    POSTS ||--o{ COMMENTS : has
    POSTS ||--o{ POST_LIKES : receives
    POSTS ||--o{ POST_SAVES : saved_in
    POSTS ||--o{ POST_TAGS : tagged_in
    POSTS ||--o{ COLLAB_POSTS : collaborates
    POSTS ||--o{ PRODUCT_TAGS : tags
    POSTS ||--o{ REPOSTS : reposted_as

    REELS ||--o{ REEL_LIKES : receives
    REELS ||--o{ REEL_SAVES : saved_in
    REELS ||--o{ REEL_COMMENTS : has
    REELS ||--o{ REMIXES : "remixed_from/remixed_as"
    REELS ||--o{ REPOSTS : reposted_as
    REELS ||--o{ AUDIO_USAGE : uses
    REELS ||--o{ PRODUCT_TAGS : tags

    STORIES ||--o{ STORY_VIEWS : viewed_by
    STORIES ||--o{ STORY_REPLIES : receives
    STORIES ||--o{ HIGHLIGHTS : saved_in
    STORIES ||--o{ STORY_REACTIONS : receives

    AUDIO ||--o{ REELS : used_in
    AUDIO ||--o{ AUDIO_USAGE : tracks
    AUDIO ||--o{ COPYRIGHT_CLAIMS : has

    LOCATIONS ||--o{ POSTS : "located_in"
    LOCATIONS ||--o{ REELS : "located_in"
    LOCATIONS ||--o{ STORIES : "located_in"

    HASHTAGS ||--o{ POST_HASHTAGS : tagged_in
    HASHTAGS ||--o{ REEL_HASHTAGS : tagged_in

    CONVERSATIONS ||--o{ MESSAGES : contains
    CONVERSATIONS ||--o{ CONVERSATION_PARTICIPANTS : has

    PRODUCTS ||--o{ ORDERS : ordered_as
    PRODUCTS ||--o{ INVENTORY : tracked_in
    PRODUCTS ||--o{ COUPONS : discounted_by

    WALLETS ||--o{ TRANSACTIONS : records
    WALLETS ||--o{ PAYOUTS : processes

    USERS {
        uuid id PK
        string username UK
        string email UK
        string phone UK
        string password_hash
        string display_name
        string bio
        string avatar_url
        string website
        string gender
        date birth_date
        boolean is_verified
        boolean is_business
        boolean is_creator
        boolean is_private
        boolean is_deactivated
        boolean is_active
        jsonb settings
        jsonb privacy_settings
        jsonb notification_settings
        timestamp created_at
        timestamp updated_at
        timestamp last_login_at
        string last_login_ip
    }

    POSTS {
        uuid id PK
        uuid user_id FK
        string caption
        string[] media_urls
        string media_type
        jsonb location
        jsonb tagged_users
        boolean is_collab
        boolean is_archived
        boolean is_pinned
        int pinned_order
        timestamp created_at
        timestamp updated_at
    }

    REELS {
        uuid id PK
        uuid user_id FK
        string caption
        string video_url
        string thumbnail_url
        uuid audio_id FK
        jsonb location
        jsonb tagged_users
        jsonb effects
        jsonb filters
        int duration_seconds
        boolean is_remix
        uuid original_reel_id FK
        boolean is_collab
        boolean is_pinned
        int pinned_order
        boolean is_archived
        timestamp created_at
        timestamp updated_at
    }

    STORIES {
        uuid id PK
        uuid user_id FK
        string media_url
        string media_type
        jsonb location
        jsonb tagged_users
        jsonb poll
        jsonb question
        jsonb music
        jsonb link
        string visibility
        timestamp expires_at
        timestamp created_at
    }

    AUDIO {
        uuid id PK
        string title
        string artist
        string audio_url
        string genre
        int duration_seconds
        boolean is_original
        boolean is_copyrighted
        string copyright_status
        int usage_count
        uuid created_by FK
        timestamp created_at
    }

    LOCATIONS {
        uuid id PK
        string name
        string address
        float latitude
        float longitude
        string city
        string country
        string place_id
        int post_count
        timestamp created_at
    }

    HASHTAGS {
        uuid id PK
        string name UK
        int post_count
        int reel_count
        timestamp created_at
    }

    FOLLOWS {
        uuid id PK
        uuid follower_id FK
        uuid following_id FK
        string status
        timestamp created_at
    }

    CLOSE_FRIENDS {
        uuid id PK
        uuid user_id FK
        uuid close_friend_id FK
        timestamp created_at
    }

    NOTES {
        uuid id PK
        uuid user_id FK
        string content
        string emoji
        string music_track_id
        string visibility
        timestamp expires_at
        timestamp created_at
    }

    LIVE_STREAMS {
        uuid id PK
        uuid user_id FK
        string title
        string stream_key
        string status
        int viewer_count
        int peak_viewers
        int total_gifts
        timestamp started_at
        timestamp ended_at
    }

    CONVERSATIONS {
        uuid id PK
        string type
        string name
        timestamp created_at
        timestamp updated_at
    }

    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        uuid sender_id FK
        string content
        string message_type
        jsonb media_urls
        jsonb reactions
        boolean is_read
        timestamp created_at
    }

    PRODUCTS {
        uuid id PK
        uuid seller_id FK
        string name
        string description
        string[] image_urls
        float price
        string currency
        int stock
        string category
        boolean is_active
        timestamp created_at
    }

    ORDERS {
        uuid id PK
        uuid buyer_id FK
        uuid product_id FK
        int quantity
        float total_amount
        string status
        jsonb shipping_address
        string payment_method
        timestamp created_at
    }

    WALLETS {
        uuid id PK
        uuid user_id FK
        float balance
        float pending_balance
        string currency
        timestamp created_at
    }

    TRANSACTIONS {
        uuid id PK
        uuid wallet_id FK
        string type
        float amount
        string currency
        string status
        string reference_id
        jsonb metadata
        timestamp created_at
    }

    SUBSCRIPTIONS {
        uuid id PK
        uuid subscriber_id FK
        uuid creator_id FK
        float price
        string status
        timestamp started_at
        timestamp expires_at
    }

    COPYRIGHT_REPORTS {
        uuid id PK
        uuid reporter_id FK
        string content_type
        uuid content_id FK
        string claim_type
        string status
        string evidence_url
        text description
        timestamp created_at
    }

    REPORTS {
        uuid id PK
        uuid reporter_id FK
        string content_type
        uuid content_id FK
        string reason
        text description
        string status
        timestamp created_at
    }

    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        string type
        string title
        string body
        jsonb data
        boolean is_read
        timestamp created_at
    }

    EVENTS {
        uuid id PK
        uuid user_id FK
        string event_type
        string content_type
        uuid content_id FK
        jsonb metadata
        string session_id
        string ip_address
        string user_agent
        timestamp created_at
    }

    SESSIONS {
        uuid id PK
        uuid user_id FK
        string device_type
        string device_id
        string ip_address
        string user_agent
        string refresh_token
        boolean is_active
        timestamp created_at
        timestamp expires_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string entity_type
        uuid entity_id
        jsonb old_values
        jsonb new_values
        string ip_address
        timestamp created_at
    }

    FEATURE_FLAGS {
        string key PK
        boolean enabled
        jsonb config
        timestamp updated_at
    }
```

---

## 4. Database Tables — Complete Schema

### 4.1 Core User Tables

#### `users`
```sql
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username            VARCHAR(30) UNIQUE NOT NULL,
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(20) UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    display_name        VARCHAR(100),
    bio                 VARCHAR(500),
    avatar_url          TEXT,
    website             VARCHAR(255),
    gender              VARCHAR(20),
    birth_date          DATE,
    is_verified         BOOLEAN DEFAULT FALSE,
    is_business         BOOLEAN DEFAULT FALSE,
    is_creator          BOOLEAN DEFAULT FALSE,
    is_private          BOOLEAN DEFAULT FALSE,
    is_deactivated       BOOLEAN DEFAULT FALSE,
    is_active           BOOLEAN DEFAULT TRUE,
    settings            JSONB DEFAULT '{}',
    privacy_settings    JSONB DEFAULT '{}',
    notification_settings JSONB DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at       TIMESTAMP WITH TIME ZONE,
    last_login_ip       INET
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_is_creator ON users(is_creator) WHERE is_creator = TRUE;
CREATE INDEX idx_users_is_business ON users(is_business) WHERE is_business = TRUE;
```

#### `sessions`
```sql
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_type     VARCHAR(50),
    device_id       VARCHAR(255),
    ip_address      INET,
    user_agent      TEXT,
    refresh_token   VARCHAR(500),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

#### `follows`
```sql
CREATE TABLE follows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20) DEFAULT 'active', -- active, pending, blocked
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
```

#### `close_friends`
```sql
CREATE TABLE close_friends (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    close_friend_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, close_friend_id)
);

CREATE INDEX idx_close_friends_user ON close_friends(user_id);
```

#### `blocks`
```sql
CREATE TABLE blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);
```

#### `restricts`
```sql
CREATE TABLE restricts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restrictor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restricted_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restrictor_id, restricted_id)
);
```

---

### 4.2 Content Tables

#### `posts`
```sql
CREATE TABLE posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption         TEXT,
    media_urls      TEXT[] NOT NULL,
    media_type      VARCHAR(20) NOT NULL, -- image, video, carousel
    location        JSONB,
    tagged_users    JSONB DEFAULT '[]',
    is_collab       BOOLEAN DEFAULT FALSE,
    is_archived     BOOLEAN DEFAULT FALSE,
    is_pinned       BOOLEAN DEFAULT FALSE,
    pinned_order    INT DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_is_pinned ON posts(is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX idx_posts_location ON posts USING GIN(location);
```

#### `reels`
```sql
CREATE TABLE reels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption             TEXT,
    video_url           TEXT NOT NULL,
    thumbnail_url       TEXT,
    audio_id            UUID REFERENCES audio(id),
    location            JSONB,
    tagged_users        JSONB DEFAULT '[]',
    effects             JSONB DEFAULT '[]',
    filters             JSONB DEFAULT '[]',
    duration_seconds    INT,
    is_remix            BOOLEAN DEFAULT FALSE,
    original_reel_id    UUID REFERENCES reels(id),
    is_collab           BOOLEAN DEFAULT FALSE,
    is_pinned           BOOLEAN DEFAULT FALSE,
    pinned_order        INT DEFAULT 0,
    is_archived         BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reels_user_id ON reels(user_id);
CREATE INDEX idx_reels_created_at ON reels(created_at DESC);
CREATE INDEX idx_reels_audio_id ON reels(audio_id);
CREATE INDEX idx_reels_is_remix ON reels(is_remix) WHERE is_remix = TRUE;
CREATE INDEX idx_reels_original_reel_id ON reels(original_reel_id);
```

#### `stories`
```sql
CREATE TABLE stories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_url       TEXT NOT NULL,
    media_type      VARCHAR(20) NOT NULL, -- image, video
    location        JSONB,
    tagged_users    JSONB DEFAULT '[]',
    poll            JSONB,
    question        JSONB,
    music           JSONB,
    link            JSONB,
    visibility      VARCHAR(20) DEFAULT 'public', -- public, close_friends
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_stories_user_id ON stories(user_id);
CREATE INDEX idx_stories_expires_at ON stories(expires_at);
CREATE INDEX idx_stories_visibility ON stories(visibility);
```

#### `highlights`
```sql
CREATE TABLE highlights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(100) NOT NULL,
    cover_url       TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_highlights_user_id ON highlights(user_id);
```

#### `highlight_stories`
```sql
CREATE TABLE highlight_stories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    highlight_id    UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    story_id        UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(highlight_id, story_id)
);
```

---

### 4.3 Engagement Tables

#### `post_likes`
```sql
CREATE TABLE post_likes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id         UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_likes_post ON post_likes(post_id);
CREATE INDEX idx_post_likes_user ON post_likes(user_id);
```

#### `reel_likes`
```sql
CREATE TABLE reel_likes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id         UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(reel_id, user_id)
);

CREATE INDEX idx_reel_likes_reel ON reel_likes(reel_id);
CREATE INDEX idx_reel_likes_user ON reel_likes(user_id);
```

#### `comments`
```sql
CREATE TABLE comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
    reel_id         UUID REFERENCES reels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES comments(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    is_pinned       BOOLEAN DEFAULT FALSE,
    is_liked        BOOLEAN DEFAULT FALSE,
    like_count      INT DEFAULT 0,
    reply_count     INT DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (post_id IS NOT NULL OR reel_id IS NOT NULL)
);

CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_reel ON comments(reel_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_is_pinned ON comments(is_pinned) WHERE is_pinned = TRUE;
```

#### `comment_likes`
```sql
CREATE TABLE comment_likes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id      UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);
```

#### `saves`
```sql
CREATE TABLE saves (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
    reel_id         UUID REFERENCES reels(id) ON DELETE CASCADE,
    collection_id   UUID,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (post_id IS NOT NULL OR reel_id IS NOT NULL)
);

CREATE INDEX idx_saves_user ON saves(user_id);
CREATE INDEX idx_saves_post ON saves(post_id);
CREATE INDEX idx_saves_reel ON saves(reel_id);
```

#### `save_collections`
```sql
CREATE TABLE save_collections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    is_private      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 4.4 Audio System

#### `audio`
```sql
CREATE TABLE audio (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               VARCHAR(255) NOT NULL,
    artist              VARCHAR(255),
    audio_url           TEXT NOT NULL,
    genre               VARCHAR(100),
    duration_seconds    INT,
    is_original         BOOLEAN DEFAULT FALSE,
    is_copyrighted      BOOLEAN DEFAULT FALSE,
    copyright_status    VARCHAR(50), -- cleared, restricted, blocked
    usage_count         INT DEFAULT 0,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audio_title ON audio(title);
CREATE INDEX idx_audio_artist ON audio(artist);
CREATE INDEX idx_audio_genre ON audio(genre);
CREATE INDEX idx_audio_is_original ON audio(is_original) WHERE is_original = TRUE;
```

#### `audio_usage`
```sql
CREATE TABLE audio_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audio_id        UUID NOT NULL REFERENCES audio(id) ON DELETE CASCADE,
    reel_id         UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audio_usage_audio ON audio_usage(audio_id);
CREATE INDEX idx_audio_usage_reel ON audio_usage(reel_id);
```

---

### 4.5 Location System

#### `locations`
```sql
CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    address         TEXT,
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    city            VARCHAR(100),
    country         VARCHAR(100),
    place_id        VARCHAR(255),
    post_count      INT DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_locations_name ON locations(name);
CREATE INDEX idx_locations_city ON locations(city);
CREATE INDEX idx_locations_country ON locations(country);
CREATE INDEX idx_locations_coords ON locations(latitude, longitude);
```

---

### 4.6 Hashtag System

#### `hashtags`
```sql
CREATE TABLE hashtags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) UNIQUE NOT NULL,
    post_count      INT DEFAULT 0,
    reel_count      INT DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_hashtags_name ON hashtags(name);
```

#### `post_hashtags`
```sql
CREATE TABLE post_hashtags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id         UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    hashtag_id      UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, hashtag_id)
);
```

#### `reel_hashtags`
```sql
CREATE TABLE reel_hashtags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reel_id         UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    hashtag_id      UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(reel_id, hashtag_id)
);
```

---

### 4.7 Notes System

#### `notes`
```sql
CREATE TABLE notes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content             VARCHAR(200),
    emoji               VARCHAR(10),
    music_track_id      VARCHAR(100),
    visibility          VARCHAR(20) DEFAULT 'followers', -- followers, close_friends
    expires_at          TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_expires ON notes(expires_at);
```

#### `note_replies`
```sql
CREATE TABLE note_replies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id         UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_note_replies_note ON note_replies(note_id);
CREATE INDEX idx_note_replies_sender ON note_replies(sender_id);
```

---

### 4.8 Repost / Remix System

#### `reposts`
```sql
CREATE TABLE reposts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
    reel_id         UUID REFERENCES reels(id) ON DELETE CASCADE,
    caption         TEXT,
    is_removed      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (post_id IS NOT NULL OR reel_id IS NOT NULL)
);

CREATE INDEX idx_reposts_user ON reposts(user_id);
CREATE INDEX idx_reposts_post ON reposts(post_id);
CREATE INDEX idx_reposts_reel ON reposts(reel_id);
```

#### `remixes`
```sql
CREATE TABLE remixes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_reel_id    UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    remix_reel_id       UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_remixes_original ON remixes(original_reel_id);
CREATE INDEX idx_remixes_remix ON remixes(remix_reel_id);
```

---

### 4.9 Direct Messaging

#### `conversations`
```sql
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type            VARCHAR(20) NOT NULL, -- direct, group
    name            VARCHAR(255),
    avatar_url      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

#### `conversation_participants`
```sql
CREATE TABLE conversation_participants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                VARCHAR(20) DEFAULT 'member', -- admin, member
    is_muted            BOOLEAN DEFAULT FALSE,
    joined_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_conv_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX idx_conv_participants_user ON conversation_participants(user_id);
```

#### `messages`
```sql
CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content             TEXT,
    message_type        VARCHAR(20) DEFAULT 'text', -- text, image, video, audio, voice, sticker, gif
    media_urls          JSONB DEFAULT '[]',
    reactions           JSONB DEFAULT '{}',
    reply_to_id         UUID REFERENCES messages(id),
    is_read             BOOLEAN DEFAULT FALSE,
    is_deleted          BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
```

---

### 4.10 Live Streaming

#### `live_streams`
```sql
CREATE TABLE live_streams (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               VARCHAR(255),
    stream_key          VARCHAR(255) UNIQUE,
    status              VARCHAR(20) DEFAULT 'live', -- live, ended
    viewer_count        INT DEFAULT 0,
    peak_viewers        INT DEFAULT 0,
    total_gifts         INT DEFAULT 0,
    started_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at            TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_live_streams_user ON live_streams(user_id);
CREATE INDEX idx_live_streams_status ON live_streams(status);
```

#### `live_viewers`
```sql
CREATE TABLE live_viewers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_stream_id      UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at             TIMESTAMP WITH TIME ZONE,
    UNIQUE(live_stream_id, user_id)
);
```

#### `live_gifts`
```sql
CREATE TABLE live_gifts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_stream_id      UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
    sender_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_type           VARCHAR(50) NOT NULL,
    quantity            INT DEFAULT 1,
    value               DECIMAL(10, 2),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 4.11 Notifications

#### `notifications`
```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(255),
    body            TEXT,
    data            JSONB DEFAULT '{}',
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
```

---

### 4.12 Monetization

#### `wallets`
```sql
CREATE TABLE wallets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance             DECIMAL(12, 2) DEFAULT 0.00,
    pending_balance     DECIMAL(12, 2) DEFAULT 0.00,
    currency            VARCHAR(3) DEFAULT 'USD',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);
```

#### `transactions`
```sql
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL, -- credit, debit
    amount          DECIMAL(12, 2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    status          VARCHAR(20) DEFAULT 'completed', -- pending, completed, failed, refunded
    reference_id    VARCHAR(255),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet ON transactions(wallet_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
```

#### `payouts`
```sql
CREATE TABLE payouts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          DECIMAL(12, 2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    status          VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    method          VARCHAR(50), -- bank_transfer, paypal, upi
    details         JSONB DEFAULT '{}',
    processed_at    TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `subscriptions`
```sql
CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price               DECIMAL(10, 2) NOT NULL,
    status              VARCHAR(20) DEFAULT 'active', -- active, expired, cancelled
    started_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at          TIMESTAMP WITH TIME ZONE,
    UNIQUE(subscriber_id, creator_id)
);

CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE INDEX idx_subscriptions_creator ON subscriptions(creator_id);
```

#### `gifts`
```sql
CREATE TABLE gifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_type       VARCHAR(50) NOT NULL,
    quantity        INT DEFAULT 1,
    value           DECIMAL(10, 2),
    content_type    VARCHAR(20), -- post, reel, story
    content_id      UUID,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 4.13 Shopping / Business

#### `products`
```sql
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    image_urls      TEXT[] DEFAULT '{}',
    price           DECIMAL(10, 2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    stock           INT DEFAULT 0,
    category        VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_active ON products(is_active) WHERE is_active = TRUE;
```

#### `orders`
```sql
CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity            INT NOT NULL,
    total_amount        DECIMAL(12, 2) NOT NULL,
    status              VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, shipped, delivered, cancelled, refunded
    shipping_address    JSONB,
    payment_method      VARCHAR(50),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
CREATE INDEX idx_orders_status ON orders(status);
```

#### `coupons`
```sql
CREATE TABLE coupons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code            VARCHAR(50) UNIQUE NOT NULL,
    discount_type   VARCHAR(20) NOT NULL, -- percentage, fixed
    discount_value  DECIMAL(10, 2) NOT NULL,
    min_order_value DECIMAL(10, 2) DEFAULT 0,
    max_uses       INT,
    used_count      INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    expires_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `product_tags`
```sql
CREATE TABLE product_tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
    reel_id         UUID REFERENCES reels(id) ON DELETE CASCADE,
    position        JSONB, -- {x: 0.5, y: 0.5}
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (post_id IS NOT NULL OR reel_id IS NOT NULL)
);
```

---

### 4.14 Copyright System

#### `copyright_reports`
```sql
CREATE TABLE copyright_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type    VARCHAR(20) NOT NULL, -- post, reel, audio, story
    content_id      UUID NOT NULL,
    claim_type      VARCHAR(50) NOT NULL, -- ownership, infringement, takedown
    status          VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, accepted, rejected, appealed
    evidence_url    TEXT,
    description     TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_copyright_reports_reporter ON copyright_reports(reporter_id);
CREATE INDEX idx_copyright_reports_content ON copyright_reports(content_type, content_id);
CREATE INDEX idx_copyright_reports_status ON copyright_reports(status);
```

#### `copyright_appeals`
```sql
CREATE TABLE copyright_appeals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id           UUID NOT NULL REFERENCES copyright_reports(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason              TEXT NOT NULL,
    evidence_url        TEXT,
    status              VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `repeat_infringers`
```sql
CREATE TABLE repeat_infringers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    strike_count        INT DEFAULT 0,
    last_strike_at      TIMESTAMP WITH TIME ZONE,
    is_banned           BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 4.15 Safety & Moderation

#### `reports`
```sql
CREATE TABLE reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type    VARCHAR(20) NOT NULL, -- post, reel, user, comment, message
    content_id      UUID NOT NULL,
    reason          VARCHAR(100) NOT NULL,
    description     TEXT,
    status          VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, action_taken, dismissed
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reports_reporter ON reports(reporter_id);
CREATE INDEX idx_reports_content ON reports(content_type, content_id);
CREATE INDEX idx_reports_status ON reports(status);
```

#### `moderation_actions`
```sql
CREATE TABLE moderation_actions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moderator_id        UUID REFERENCES users(id),
    target_user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    content_type        VARCHAR(20),
    content_id          UUID,
    action_type         VARCHAR(50) NOT NULL, -- warn, mute, ban, delete_content, shadow_ban
    reason              TEXT,
    duration_hours      INT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `audit_logs`
```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

---

### 4.16 Analytics / Event Tracking

#### `events`
```sql
CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type      VARCHAR(50) NOT NULL,
    content_type    VARCHAR(20),
    content_id      UUID,
    metadata        JSONB DEFAULT '{}',
    session_id      VARCHAR(255),
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_content ON events(content_type, content_id);
CREATE INDEX idx_events_created ON events(created_at DESC);
CREATE INDEX idx_events_session ON events(session_id);
```

#### `user_analytics`
```sql
CREATE TABLE user_analytics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date                DATE NOT NULL,
    reach               INT DEFAULT 0,
    impressions         INT DEFAULT 0,
    profile_views       INT DEFAULT 0,
    website_clicks      INT DEFAULT 0,
    followers_gained     INT DEFAULT 0,
    followers_lost      INT DEFAULT 0,
    posts_count         INT DEFAULT 0,
    reels_count         INT DEFAULT 0,
    stories_count       INT DEFAULT 0,
    total_likes_received INT DEFAULT 0,
    total_comments_received INT DEFAULT 0,
    total_shares_received INT DEFAULT 0,
    total_saves_received INT DEFAULT 0,
    reel_watch_time     INT DEFAULT 0, -- in seconds
    reel_completion_rate DECIMAL(5, 2),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_user_analytics_user ON user_analytics(user_id);
CREATE INDEX idx_user_analytics_date ON user_analytics(date);
```

#### `content_analytics`
```sql
CREATE TABLE content_analytics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type        VARCHAR(20) NOT NULL, -- post, reel, story
    content_id          UUID NOT NULL,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date                DATE NOT NULL,
    views               INT DEFAULT 0,
    unique_views        INT DEFAULT 0,
    likes               INT DEFAULT 0,
    comments            INT DEFAULT 0,
    shares              INT DEFAULT 0,
    saves               INT DEFAULT 0,
    watch_time          INT DEFAULT 0, -- in seconds (reels)
    completion_rate     DECIMAL(5, 2),
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(content_type, content_id, date)
);
```

---

### 4.17 Feature Flags

#### `feature_flags`
```sql
CREATE TABLE feature_flags (
    key             VARCHAR(100) PRIMARY KEY,
    enabled         BOOLEAN DEFAULT FALSE,
    config          JSONB DEFAULT '{}',
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 4.18 Data Management

#### `data_exports`
```sql
CREATE TABLE data_exports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    file_url        TEXT,
    file_size       BIGINT,
    expires_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `deleted_content`
```sql
CREATE TABLE deleted_content (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type    VARCHAR(20) NOT NULL,
    content_id      UUID NOT NULL,
    content_data    JSONB,
    deleted_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    purge_after     TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);
```

---

## 5. API Endpoints

### 5.1 Base URL

```
Production:  https://api.domdom.com/api/v1
Staging:     https://staging-api.domdom.com/api/v1
Development: http://localhost:3000/api/v1
```

### 5.2 Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register new user |
| `POST` | `/auth/login` | Login with email/phone + password |
| `POST` | `/auth/logout` | Logout current session |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/forgot-password` | Send password reset email |
| `POST` | `/auth/reset-password` | Reset password with token |
| `POST` | `/auth/verify-email` | Verify email address |
| `POST` | `/auth/verify-phone` | Verify phone number (OTP) |
| `POST` | `/auth/social-login` | Login with Google/Apple/Facebook |
| `POST` | `/auth/change-password` | Change password |
| `POST` | `/auth/2fa/setup` | Setup two-factor authentication |
| `POST` | `/auth/2fa/verify` | Verify 2FA code |
| `POST` | `/auth/2fa/disable` | Disable 2FA |

### 5.3 Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/:username` | Get user profile |
| `PATCH` | `/users/me` | Update own profile |
| `GET` | `/users/me` | Get own profile |
| `GET` | `/users/:id/followers` | Get user's followers |
| `GET` | `/users/:id/following` | Get user's following |
| `POST` | `/users/:id/follow` | Follow user |
| `DELETE` | `/users/:id/follow` | Unfollow user |
| `POST` | `/users/:id/block` | Block user |
| `DELETE` | `/users/:id/block` | Unblock user |
| `POST` | `/users/:id/restrict` | Restrict user |
| `DELETE` | `/users/:id/restrict` | Unrestrict user |
| `GET` | `/users/search` | Search users |
| `GET` | `/users/suggested` | Get suggested users |
| `POST` | `/users/:id/close-friends/add` | Add to close friends |
| `DELETE` | `/users/:id/close-friends/remove` | Remove from close friends |
| `GET` | `/users/me/close-friends` | Get close friends list |
| `POST` | `/users/me/deactivate` | Temporarily deactivate account |
| `POST` | `/users/me/activate` | Reactivate account |
| `DELETE` | `/users/me` | Delete account permanently |
| `GET` | `/users/:id/analytics` | Get user analytics (creator) |
| `GET` | `/users/:id/audience` | Get audience demographics |

### 5.4 Posts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/posts` | Create new post |
| `GET` | `/posts/:id` | Get post by ID |
| `PATCH` | `/posts/:id` | Update post |
| `DELETE` | `/posts/:id` | Delete post |
| `GET` | `/posts/feed/following` | Get following feed |
| `GET` | `/posts/feed/foryou` | Get For You feed |
| `GET` | `/posts/explore` | Get explore feed |
| `POST` | `/posts/:id/like` | Like post |
| `DELETE` | `/posts/:id/like` | Unlike post |
| `POST` | `/posts/:id/save` | Save post |
| `DELETE` | `/posts/:id/save` | Unsave post |
| `GET` | `/posts/:id/saves` | Get post saves |
| `POST` | `/posts/:id/pin` | Pin post to profile |
| `DELETE` | `/posts/:id/pin` | Unpin post |
| `POST` | `/posts/:id/repost` | Repost post |
| `DELETE` | `/posts/:id/repost` | Remove repost |
| `GET` | `/posts/:id/reposts` | Get post reposts |
| `POST` | `/posts/:id/archive` | Archive post |
| `POST` | `/posts/:id/unarchive` | Unarchive post |
| `GET` | `/posts/user/:userId` | Get user's posts |
| `GET` | `/posts/tagged/:userId` | Get posts where user is tagged |
| `GET` | `/posts/location/:locationId` | Get posts by location |
| `GET` | `/posts/hashtag/:hashtag` | Get posts by hashtag |

### 5.5 Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/posts/:id/comments` | Add comment to post |
| `POST` | `/reels/:id/comments` | Add comment to reel |
| `GET` | `/posts/:id/comments` | Get post comments |
| `GET` | `/reels/:id/comments` | Get reel comments |
| `PATCH` | `/comments/:id` | Update comment |
| `DELETE` | `/comments/:id` | Delete comment |
| `POST` | `/comments/:id/like` | Like comment |
| `DELETE` | `/comments/:id/like` | Unlike comment |
| `POST` | `/comments/:id/reply` | Reply to comment |
| `GET` | `/comments/:id/replies` | Get comment replies |
| `POST` | `/comments/:id/pin` | Pin comment |
| `DELETE` | `/comments/:id/pin` | Unpin comment |

### 5.6 Reels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/reels` | Create new reel |
| `GET` | `/reels/:id` | Get reel by ID |
| `PATCH` | `/reels/:id` | Update reel |
| `DELETE` | `/reels/:id` | Delete reel |
| `GET` | `/reels/feed` | Get reels feed |
| `GET` | `/reels/trending` | Get trending reels |
| `GET` | `/reels/explore` | Get explore reels |
| `POST` | `/reels/:id/like` | Like reel |
| `DELETE` | `/reels/:id/like` | Unlike reel |
| `POST` | `/reels/:id/save` | Save reel |
| `DELETE` | `/reels/:id/save` | Unsave reel |
| `POST` | `/reels/:id/pin` | Pin reel to profile |
| `DELETE` | `/reels/:id/pin` | Unpin reel |
| `POST` | `/reels/:id/repost` | Repost reel |
| `DELETE` | `/reels/:id/repost` | Remove repost |
| `POST` | `/reels/:id/remix` | Create remix of reel |
| `GET` | `/reels/:id/remixes` | Get remixes of reel |
| `GET` | `/reels/user/:userId` | Get user's reels |
| `GET` | `/reels/audio/:audioId` | Get reels using audio |
| `GET` | `/reels/location/:locationId` | Get reels by location |
| `GET` | `/reels/hashtag/:hashtag` | Get reels by hashtag |

### 5.7 Stories

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/stories` | Create new story |
| `GET` | `/stories/:id` | Get story by ID |
| `DELETE` | `/stories/:id` | Delete story |
| `GET` | `/stories/user/:userId` | Get user's active stories |
| `GET` | `/stories/feed` | Get stories feed |
| `GET` | `/stories/friends` | Get close friends stories |
| `POST` | `/stories/:id/view` | Mark story as viewed |
| `GET` | `/stories/:id/views` | Get story viewers |
| `POST` | `/stories/:id/reply` | Reply to story (DM) |
| `POST` | `/stories/:id/reaction` | React to story |
| `GET` | `/stories/:id/reactions` | Get story reactions |
| `POST` | `/stories/:id/highlight` | Save story to highlight |
| `GET` | `/stories/highlights/:userId` | Get user's highlights |

### 5.8 Audio

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/audio/trending` | Get trending audio |
| `GET` | `/audio/search` | Search audio |
| `GET` | `/audio/:id` | Get audio details |
| `GET` | `/audio/:id/reels` | Get reels using this audio |
| `POST` | `/audio` | Upload original audio |
| `POST` | `/audio/:id/use` | Use audio in reel |
| `GET` | `/audio/:id/usage` | Get audio usage stats |
| `GET` | `/audio/original` | Get original audio list |
| `GET` | `/audio/library` | Get music library |
| `GET` | `/audio/genres` | Get audio genres |

### 5.9 Locations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/locations/search` | Search locations |
| `GET` | `/locations/:id` | Get location details |
| `GET` | `/locations/:id/posts` | Get posts at location |
| `GET` | `/locations/:id/reels` | Get reels at location |
| `GET` | `/locations/trending` | Get trending locations |
| `GET` | `/locations/nearby` | Get nearby locations |
| `POST` | `/locations` | Create new location |

### 5.10 Hashtags

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/hashtags/search` | Search hashtags |
| `GET` | `/hashtags/:name` | Get hashtag details |
| `GET` | `/hashtags/:name/posts` | Get posts with hashtag |
| `GET` | `/hashtags/:name/reels` | Get reels with hashtag |
| `GET` | `/hashtags/trending` | Get trending hashtags |
| `POST` | `/hashtags/:name/follow` | Follow hashtag |
| `DELETE` | `/hashtags/:name/follow` | Unfollow hashtag |

### 5.11 Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/notes` | Create new note |
| `GET` | `/notes/:id` | Get note by ID |
| `DELETE` | `/notes/:id` | Delete note |
| `GET` | `/notes/feed` | Get notes feed |
| `GET` | `/notes/user/:userId` | Get user's notes |
| `POST` | `/notes/:id/reply` | Reply to note (creates DM) |
| `GET` | `/notes/:id/replies` | Get note replies |

### 5.12 Direct Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/conversations` | Get all conversations |
| `POST` | `/conversations` | Create new conversation |
| `GET` | `/conversations/:id` | Get conversation details |
| `PATCH` | `/conversations/:id` | Update conversation |
| `DELETE` | `/conversations/:id` | Delete conversation |
| `GET` | `/conversations/:id/messages` | Get conversation messages |
| `POST` | `/conversations/:id/messages` | Send message |
| `PATCH` | `/messages/:id` | Update message |
| `DELETE` | `/messages/:id` | Delete message |
| `POST` | `/messages/:id/react` | React to message |
| `POST` | `/conversations/:id/read` | Mark conversation as read |
| `POST` | `/conversations/:id/mute` | Mute conversation |
| `POST` | `/conversations/:id/unmute` | Unmute conversation |
| `POST` | `/conversations/:id/participants` | Add participant |
| `DELETE` | `/conversations/:id/participants/:userId` | Remove participant |
| `POST` | `/conversations/:id/typing` | Send typing indicator |

### 5.13 Live Streaming

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/live/start` | Start live stream |
| `POST` | `/live/:id/end` | End live stream |
| `GET` | `/live/:id` | Get live stream details |
| `GET` | `/live/feed` | Get live streams feed |
| `GET` | `/live/trending` | Get trending live streams |
| `POST` | `/live/:id/join` | Join live stream |
| `POST` | `/live/:id/leave` | Leave live stream |
| `GET` | `/live/:id/viewers` | Get live viewers |
| `POST` | `/live/:id/chat` | Send chat message |
| `GET` | `/live/:id/chat` | Get chat messages |
| `POST` | `/live/:id/gift` | Send gift |
| `POST` | `/live/:id/guest/invite` | Invite guest |
| `POST` | `/live/:id/guest/accept` | Accept guest invite |
| `POST` | `/live/:id/moderator/add` | Add moderator |
| `POST` | `/live/:id/moderator/remove` | Remove moderator |

### 5.14 Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notifications` | Get all notifications |
| `GET` | `/notifications/unread` | Get unread notifications |
| `POST` | `/notifications/:id/read` | Mark notification as read |
| `POST` | `/notifications/read-all` | Mark all as read |
| `DELETE` | `/notifications/:id` | Delete notification |
| `GET` | `/notifications/settings` | Get notification settings |
| `PATCH` | `/notifications/settings` | Update notification settings |

### 5.15 Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/search` | Global search (users, hashtags, locations) |
| `GET` | `/search/users` | Search users |
| `GET` | `/search/hashtags` | Search hashtags |
| `GET` | `/search/locations` | Search locations |
| `GET` | `/search/audio` | Search audio |
| `GET` | `/search/posts` | Search posts |
| `GET` | `/search/reels` | Search reels |
| `GET` | `/search/recent` | Get recent searches |
| `DELETE` | `/search/recent/:id` | Delete recent search |
| `DELETE` | `/search/recent` | Clear all recent searches |

### 5.16 Monetization

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/wallet` | Get own wallet |
| `GET` | `/wallet/transactions` | Get transaction history |
| `POST` | `/wallet/payout` | Request payout |
| `GET` | `/wallet/payouts` | Get payout history |
| `POST` | `/subscriptions/:creatorId` | Subscribe to creator |
| `DELETE` | `/subscriptions/:creatorId` | Unsubscribe from creator |
| `GET` | `/subscriptions` | Get own subscriptions |
| `GET` | `/subscriptions/subscribers` | Get creator's subscribers |
| `POST` | `/gifts/send` | Send gift |
| `GET` | `/gifts/received` | Get received gifts |
| `GET` | `/gifts/sent` | Get sent gifts |
| `GET` | `/earnings` | Get earnings overview |
| `GET` | `/earnings/breakdown` | Get earnings breakdown |

### 5.17 Shopping

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/products` | Create product |
| `GET` | `/products/:id` | Get product details |
| `PATCH` | `/products/:id` | Update product |
| `DELETE` | `/products/:id` | Delete product |
| `GET` | `/products` | List products |
| `GET` | `/products/search` | Search products |
| `GET` | `/products/category/:category` | Get products by category |
| `GET` | `/shop/:userId` | Get user's shop |
| `POST` | `/orders` | Place order |
| `GET` | `/orders` | Get own orders |
| `GET` | `/orders/:id` | Get order details |
| `PATCH` | `/orders/:id` | Update order status |
| `GET` | `/seller/orders` | Get seller's orders |
| `POST` | `/coupons` | Create coupon |
| `GET` | `/coupons/:code` | Validate coupon |
| `POST` | `/coupons/:code/apply` | Apply coupon |

### 5.18 Copyright

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/copyright/report` | File copyright report |
| `GET` | `/copyright/reports` | Get own copyright reports |
| `GET` | `/copyright/reports/:id` | Get report details |
| `POST` | `/copyright/reports/:id/appeal` | Appeal copyright decision |
| `GET` | `/copyright/reports/:id/appeals` | Get report appeals |

### 5.19 Safety & Reporting

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/reports` | Report content/user |
| `GET` | `/reports` | Get own reports |
| `POST` | `/safety/check-content` | Check content before posting |
| `GET` | `/safety/blocked-users` | Get blocked users list |
| `GET` | `/safety/restricted-users` | Get restricted users list |

### 5.20 Data Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/data/export` | Request data export |
| `GET` | `/data/exports` | Get export history |
| `GET` | `/data/exports/:id/download` | Download exported data |
| `GET` | `/data/recently-deleted` | Get recently deleted content |
| `POST` | `/data/recently-deleted/:id/restore` | Restore deleted content |
| `DELETE` | `/data/recently-deleted/:id` | Permanently delete |

### 5.21 Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/share/:contentType/:id` | Get share links |
| `GET` | `/share/:contentType/:id/qr` | Get QR code |
| `POST` | `/share/:contentType/:id/track` | Track share click |

### 5.22 Feature Flags

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/features` | Get all feature flags (public) |
| `GET` | `/features/:key` | Get specific feature flag |

---

## 6. WebSocket Events

### 6.1 Connection

```javascript
// Connection
ws://api.domdom.com/ws?token=<JWT_TOKEN>

// Events structure
{
  "event": "event_name",
  "data": { ... },
  "timestamp": "2026-10-06T12:00:00Z"
}
```

### 6.2 Client → Server Events

| Event | Description | Payload |
|-------|-------------|---------|
| `message.send` | Send DM message | `{ conversationId, content, messageType, mediaUrls }` |
| `message.read` | Mark message as read | `{ conversationId, messageId }` |
| `message.typing` | Typing indicator | `{ conversationId, isTyping }` |
| `message.react` | React to message | `{ messageId, reaction }` |
| `live.join` | Join live stream | `{ liveStreamId }` |
| `live.leave` | Leave live stream | `{ liveStreamId }` |
| `live.chat` | Send live chat message | `{ liveStreamId, content }` |
| `live.gift` | Send live gift | `{ liveStreamId, giftType, quantity }` |
| `live.react` | Live reaction | `{ liveStreamId, reaction }` |
| `story.view` | View story | `{ storyId }` |
| `story.react` | React to story | `{ storyId, reaction }` |
| `story.reply` | Reply to story | `{ storyId, content }` |
| `note.reply` | Reply to note | `{ noteId, content }` |
| `presence.update` | Update online status | `{ status: 'online' | 'away' | 'offline' }` |
| `notification.read` | Mark notification read | `{ notificationId }` |
| `call.start` | Start voice/video call | `{ recipientId, callType }` |
| `call.accept` | Accept call | `{ callId }` |
| `call.reject` | Reject call | `{ callId }` |
| `call.end` | End call | `{ callId }` |

### 6.3 Server → Client Events

| Event | Description | Payload |
|-------|-------------|---------|
| `message.new` | New message received | `{ message }` |
| `message.update` | Message updated | `{ message }` |
| `message.delete` | Message deleted | `{ messageId, conversationId }` |
| `message.reaction` | Message reaction added | `{ messageId, userId, reaction }` |
| `conversation.new` | New conversation created | `{ conversation }` |
| `conversation.update` | Conversation updated | `{ conversation }` |
| `conversation.typing` | User is typing | `{ conversationId, userId, isTyping }` |
| `notification.new` | New notification | `{ notification }` |
| `live.started` | Live stream started | `{ liveStream }` |
| `live.ended` | Live stream ended | `{ liveStreamId }` |
| `live.viewer_joined` | Viewer joined live | `{ liveStreamId, userId, viewerCount }` |
| `live.viewer_left` | Viewer left live | `{ liveStreamId, userId, viewerCount }` |
| `live.chat_message` | New live chat message | `{ liveStreamId, message }` |
| `live.gift_received` | Gift received in live | `{ liveStreamId, gift }` |
| `live.reaction` | Live reaction | `{ liveStreamId, userId, reaction }` |
| `story.new` | New story from followed user | `{ story }` |
| `story.viewed` | Story viewed | `{ storyId, userId }` |
| `story.expired` | Story expired | `{ storyId }` |
| `note.new` | New note from followed user | `{ note }` |
| `note.expired` | Note expired | `{ noteId }` |
| `follow.new` | New follower | `{ user }` |
| `follow.request` | Follow request received | `{ user }` |
| `follow.accepted` | Follow request accepted | `{ user }` |
| `post.liked` | Post liked | `{ postId, userId }` |
| `post.commented` | New comment on post | `{ postId, comment }` |
| `post.mentioned` | You were mentioned | `{ postId, userId }` |
| `reel.liked` | Reel liked | `{ reelId, userId }` |
| `reel.commented` | New comment on reel | `{ reelId, comment }` |
| `reel.mentioned` | You were mentioned in reel | `{ reelId, userId }` |
| `reel.remixed` | Your reel was remixed | `{ originalReelId, remixReel }` |
| `call.incoming` | Incoming call | `{ callId, callerId, callType }` |
| `call.accepted` | Call accepted | `{ callId }` |
| `call.rejected` | Call rejected | `{ callId }` |
| `call.ended` | Call ended | `{ callId }` |
| `user.online` | User came online | `{ userId }` |
| `user.offline` | User went offline | `{ userId }` |
| `user.profile_updated` | User profile updated | `{ userId, changes }` |
| `moderation.action` | Moderation action taken | `{ action, reason }` |
| `copyright.claim` | Copyright claim on your content | `{ reportId, contentId }` |

---

## 7. Storage Architecture

### 7.1 Object Storage (MinIO / S3)

```
domdom-media/
├── avatars/
│   └── {userId}/
│       ├── original.jpg
│       ├── large.jpg (512x512)
│       ├── medium.jpg (256x256)
│       └── small.jpg (128x128)
├── posts/
│   └── {userId}/
│       └── {postId}/
│           ├── image_0.jpg
│           ├── image_1.jpg
│           └── ...
├── reels/
│   └── {userId}/
│       └── {reelId}/
│           ├── video_original.mp4
│           ├── video_1080p.mp4
│           ├── video_720p.mp4
│           ├── video_480p.mp4
│           ├── thumbnail.jpg
│           └── preview.gif
├── stories/
│   └── {userId}/
│       └── {storyId}/
│           ├── media.jpg
│           └── ...
├── audio/
│   └── {audioId}/
│       ├── audio.mp3
│       └── waveform.png
├── highlights/
│   └── {userId}/
│       └── {highlightId}/
│           └── cover.jpg
├── products/
│   └── {sellerId}/
│       └── {productId}/
│           ├── image_0.jpg
│           └── ...
├── messages/
│   └── {conversationId}/
│       └── {messageId}/
│           ├── media.jpg
│           └── ...
└── temp/
    └── {uploadId}/
```

### 7.2 CDN Strategy

| Content Type | CDN Cache | TTL |
|-------------|-----------|-----|
| Avatars | CloudFlare | 7 days |
| Post Images | CloudFlare | 30 days |
| Reel Videos | CloudFlare | 30 days |
| Stories | CloudFlare | 24 hours |
| Audio | CloudFlare | 30 days |
| Product Images | CloudFlare | 7 days |
| API Responses | Redis | 5 minutes |
| User Profiles | Redis | 10 minutes |
| Feed | Redis | 2 minutes |

### 7.3 Video Processing Pipeline

```
Upload → Queue → Transcode → Thumbnail → Store → CDN
                    │
                    ├── 1080p (1920x1080)
                    ├── 720p (1280x720)
                    ├── 480p (854x480)
                    ├── 360p (640x360)
                    ├── Thumbnail (720x1280)
                    └── Preview GIF (3s)
```

---

## 8. Permissions & Roles

### 8.1 User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| `user` | Regular user | Basic features |
| `creator` | Content creator | Analytics, monetization, professional dashboard |
| `business` | Business account | Shop, product catalog, business analytics |
| `verified` | Verified account | Badge, priority support |
| `moderator` | Content moderator | Review reports, moderate content |
| `admin` | Platform admin | Full access |
| `super_admin` | Super admin | System configuration, user management |

### 8.2 Permission Matrix

| Feature | user | creator | business | verified | moderator | admin |
|---------|------|---------|----------|----------|-----------|-------|
| Post content | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Go Live | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Analytics | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Monetization | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Shop | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Moderate content | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Feature flags | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Copyright reports | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin panel | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

### 8.3 Content Visibility

| Visibility | Who Can View |
|-----------|-------------|
| `public` | Everyone |
| `private` | Followers only |
| `close_friends` | Close friends only |
| `restricted` | Followers except restricted users |

---

## 9. Notification Events

### 9.1 Notification Types

| Type | Trigger | Title | Body |
|------|---------|-------|------|
| `follow` | Someone follows you | New Follower | `{username} started following you` |
| `follow_back` | You follow someone back | Follow Back | `{username} followed you back` |
| `like_post` | Someone likes your post | Post Like | `{username} liked your post` |
| `like_reel` | Someone likes your reel | Reel Like | `{username} liked your reel` |
| `like_comment` | Someone likes your comment | Comment Like | `{username} liked your comment` |
| `comment` | Someone comments on your post | New Comment | `{username} commented: {content}` |
| `comment_mention` | Someone mentions you in comment | Mentioned in Comment | `{username} mentioned you in a comment` |
| `post_mention` | Someone mentions you in post | Mentioned in Post | `{username} mentioned you in a post` |
| `reel_mention` | Someone mentions you in reel | Mentioned in Reel | `{username} mentioned you in a reel` |
| `share` | Someone shares your content | Content Shared | `{username} shared your {contentType}` |
| `save` | Someone saves your content | Content Saved | `{username} saved your {contentType}` |
| `repost` | Someone reposts your content | Content Reposted | `{username} reposted your {contentType}` |
| `remix` | Someone remixes your reel | Reel Remixed | `{username} remixed your reel` |
| `live_started` | Followed user goes live | Live Now | `{username} is live now` |
| `story_reply` | Someone replies to your story | Story Reply | `{username} replied to your story` |
| `story_reaction` | Someone reacts to your story | Story Reaction | `{username} reacted to your story` |
| `note_reply` | Someone replies to your note | Note Reply | `{username} replied to your note` |
| `message` | New DM message | New Message | `{username} sent you a message` |
| `group_invite` | Added to group | Group Invite | `{username} added you to a group` |
| `subscription` | New subscriber | New Subscriber | `{username} subscribed to you` |
| `gift_received` | Gift received | Gift Received | `{username} sent you a gift` |
| `payout` | Payout processed | Payout Processed | Your payout of {amount} has been processed |
| `copyright_claim` | Copyright claim filed | Copyright Claim | A copyright claim was filed on your content |
| `moderation_action` | Moderation action | Moderation Action | {action} taken on your content |
| `account_warning` | Account warning | Account Warning | {reason} |
| `feature_update` | New feature available | New Feature | {featureName} is now available! |

### 9.2 Notification Channels

| Channel | Description |
|---------|-------------|
| `push` | Push notification (FCM/APNs) |
| `email` | Email notification |
| `sms` | SMS notification (critical only) |
| `in_app` | In-app notification center |

---

## 10. Feed / Recommendation Algorithm

### 10.1 Signal Tracking

```text
┌─────────────────────────────────────────────────────────────┐
│                    SIGNAL WEIGHTS                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  VIEW              →  Weight: 1                             │
│  WATCH_TIME        →  Weight: 2 (per second)                │
│  COMPLETION        →  Weight: 5 (100% = 5, 50% = 2.5)     │
│  LIKE              →  Weight: 4                             │
│  COMMENT           →  Weight: 6                             │
│  SHARE             →  Weight: 8                             │
│  SAVE              →  Weight: 7                             │
│  PROFILE_VISIT     →  Weight: 3                             │
│  FOLLOW            →  Weight: 10                            │
│  NOT_INTERESTED    →  Weight: -10                           │
│  HIDE              →  Weight: -8                            │
│  REPORT            →  Weight: -20                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Feed Types

#### Following Feed
```sql
-- Posts from followed users, chronological
SELECT * FROM posts
WHERE user_id IN (
    SELECT following_id FROM follows WHERE follower_id = :userId
)
AND is_archived = FALSE
ORDER BY created_at DESC
LIMIT 20 OFFSET :offset;
```

#### For You Feed (Personalized)
```sql
-- Score-based recommendation
WITH user_interactions AS (
    SELECT 
        content_id,
        SUM(
            CASE event_type
                WHEN 'VIEW' THEN 1
                WHEN 'WATCH_TIME' THEN 2
                WHEN 'COMPLETION' THEN 5
                WHEN 'LIKE' THEN 4
                WHEN 'COMMENT' THEN 6
                WHEN 'SHARE' THEN 8
                WHEN 'SAVE' THEN 7
                WHEN 'PROFILE_VISIT' THEN 3
                WHEN 'FOLLOW' THEN 10
                WHEN 'NOT_INTERESTED' THEN -10
                WHEN 'HIDE' THEN -8
                WHEN 'REPORT' THEN -20
            END
        ) as score
    FROM events
    WHERE user_id = :userId
    AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY content_id
),
content_scores AS (
    SELECT 
        p.*,
        COALESCE(ui.score, 0) as user_score,
        (p.like_count * 4 + p.comment_count * 6 + p.share_count * 8 + p.save_count * 7) as popularity_score,
        EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 as hours_old
    FROM posts p
    LEFT JOIN user_interactions ui ON p.id = ui.content_id
    WHERE p.user_id != :userId
    AND p.is_archived = FALSE
    AND p.id NOT IN (
        SELECT content_id FROM events 
        WHERE user_id = :userId AND event_type IN ('HIDE', 'REPORT')
    )
)
SELECT *,
    (user_score * 0.5 + popularity_score * 0.3 + (1 / (hours_old + 2)) * 0.2) as final_score
FROM content_scores
ORDER BY final_score DESC
LIMIT 20 OFFSET :offset;
```

#### Explore Feed
```sql
-- Trending content discovery
SELECT 
    p.*,
    (p.like_count + p.comment_count * 2 + p.share_count * 3 + p.save_count * 2) / 
    POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5) as trending_score
FROM posts p
WHERE p.is_archived = FALSE
AND p.created_at > NOW() - INTERVAL '7 days'
ORDER BY trending_score DESC
LIMIT 50;
```

#### Reels Feed
```sql
-- Reels recommendation with watch time optimization
WITH reel_interactions AS (
    SELECT 
        reel_id,
        SUM(
            CASE event_type
                WHEN 'REEL_VIEW' THEN 1
                WHEN 'REEL_COMPLETE' THEN 5
                WHEN 'LIKE' THEN 4
                WHEN 'COMMENT' THEN 6
                WHEN 'SHARE' THEN 8
                WHEN 'SAVE' THEN 7
                WHEN 'NOT_INTERESTED' THEN -10
            END
        ) as score
    FROM events
    WHERE user_id = :userId
    AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY reel_id
)
SELECT 
    r.*,
    COALESCE(ri.score, 0) as user_score,
    (r.like_count * 4 + r.comment_count * 6 + r.share_count * 8 + r.save_count * 7) as popularity,
    r.reel_watch_time / NULLIF(r.view_count, 0) as avg_watch_time,
    (COALESCE(ri.score, 0) * 0.4 + 
     (r.like_count * 4 + r.comment_count * 6 + r.share_count * 8) * 0.3 +
     (r.reel_watch_time / NULLIF(r.view_count, 0)) * 0.2 +
     (1 / (EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 3600 + 2)) * 0.1
    ) as final_score
FROM reels r
LEFT JOIN reel_interactions ri ON r.id = ri.reel_id
WHERE r.is_archived = FALSE
AND r.user_id != :userId
ORDER BY final_score DESC
LIMIT 30;
```

### 10.3 Recommendation Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                 RECOMMENDATION PIPELINE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CANDIDATE GENERATION                                    │
│     ├── Followed users' content                             │
│     ├── Similar users' content (collaborative filtering)    │
│     ├── Trending content                                    │
│     ├── Hashtag-based content                               │
│     └── Location-based content                              │
│                                                             │
│  2. SCORING                                                 │
│     ├── User interest score (from signals)                  │
│     ├── Content popularity score                            │
│     ├── Recency score                                       │
│     ├── Relationship score                                  │
│     └── Diversity score                                     │
│                                                             │
│  3. RANKING                                                 │
│     ├── Apply weights                                       │
│     ├── Deduplicate                                         │
│     ├── Filter blocked/restricted                            │
│     └── Apply business rules                                │
│                                                             │
│  4. POST-PROCESSING                                         │
│     ├── Add ads (if applicable)                             │
│     ├── Ensure content diversity                            │
│     ├── A/B test variants                                   │
│     └── Cache results                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Feature Flags

### 11.1 Default Feature Flags

```json
{
  "feature_collab": true,
  "feature_live": true,
  "feature_gifts": false,
  "feature_shop": false,
  "feature_repost": true,
  "feature_remix": true,
  "feature_notes": true,
  "feature_close_friends": true,
  "feature_stories": true,
  "feature_highlights": true,
  "feature_audio": true,
  "feature_location": true,
  "feature_hashtags": true,
  "feature_search": true,
  "feature_notifications": true,
  "feature_dm": true,
  "feature_group_dm": true,
  "feature_voice_call": false,
  "feature_video_call": false,
  "feature_2fa": true,
  "feature_data_export": true,
  "feature_account_deactivation": true,
  "feature_analytics": true,
  "feature_monetization": false,
  "feature_subscriptions": false,
  "feature_badges": false,
  "feature_copyright": true,
  "feature_reporting": true,
  "feature_moderation": true,
  "feature_rate_limiting": true,
  "feature_audit_logs": true,
  "feature_api_versioning": true,
  "feature_websocket": true,
  "feature_cdn": true,
  "feature_video_transcoding": true,
  "feature_thumbnail_generation": true,
  "feature_search_indexing": true,
  "feature_database_backups": true,
  "feature_monitoring": true,
  "feature_error_tracking": true,
  "feature_cron_jobs": true,
  "feature_health_checks": true,
  "feature_load_balancing": true,
  "feature_horizontal_scaling": true
}
```

### 11.2 Feature Flag Response

```json
GET /api/v1/features

{
  "features": {
    "feature_collab": { "enabled": true },
    "feature_live": { "enabled": true },
    "feature_gifts": { "enabled": false },
    "feature_shop": { "enabled": false },
    "feature_repost": { "enabled": true }
  }
}
```

---

## 12. Event Tracking / Analytics

### 12.1 Event Types

| Event Type | Description | Trigger |
|-----------|-------------|---------|
| `POST_VIEW` | Post viewed | Post appears in feed |
| `REEL_VIEW` | Reel viewed | Reel appears in feed |
| `REEL_COMPLETE` | Reel fully watched | 100% completion |
| `REEL_WATCH_TIME` | Reel watch time | Every 5 seconds |
| `LIKE` | Content liked | Like button clicked |
| `UNLIKE` | Content unliked | Unlike button clicked |
| `COMMENT` | Comment posted | Comment submitted |
| `SHARE` | Content shared | Share button clicked |
| `SAVE` | Content saved | Save button clicked |
| `PROFILE_VIEW` | Profile viewed | Profile page loaded |
| `FOLLOW` | User followed | Follow button clicked |
| `UNFOLLOW` | User unfollowed | Unfollow button clicked |
| `STORY_VIEW` | Story viewed | Story opened |
| `STORY_REACT` | Story reacted | Reaction sent |
| `STORY_REPLY` | Story replied | Reply sent |
| `LIVE_JOIN` | Live stream joined | Join live |
| `LIVE_LEAVE` | Live stream left | Leave live |
| `LIVE_GIFT` | Gift sent in live | Gift sent |
| `DM_SENT` | Message sent | Message submitted |
| `SEARCH` | Search performed | Search query submitted |
| `NOT_INTERESTED` | Not interested | "Not interested" clicked |
| `HIDE` | Content hidden | Hide option selected |
| `REPORT` | Content reported | Report submitted |
| `BLOCK` | User blocked | Block action taken |
| `RESTRICT` | User restricted | Restrict action taken |
| `CLOSE_FRIEND_ADD` | Close friend added | Add to close friends |
| `CLOSE_FRIEND_REMOVE` | Close friend removed | Remove from close friends |
| `NOTE_CREATED` | Note created | Note posted |
| `NOTE_REPLY` | Note replied | Note reply sent |
| `REPOST` | Content reposted | Repost action taken |
| `REMIX_CREATED` | Remix created | Remix reel posted |
| `AUDIO_USED` | Audio used in reel | Reel with audio posted |
| `LOCATION_TAGGED` | Location tagged | Content with location posted |
| `HASHTAG_USED` | Hashtag used | Content with hashtag posted |
| `PRODUCT_VIEWED` | Product viewed | Product page loaded |
| `PRODUCT_TAGGED` | Product tagged | Product tag added |
| `ORDER_PLACED` | Order placed | Order submitted |
| `COUPON_APPLIED` | Coupon applied | Coupon used |
| `SUBSCRIPTION_CREATED` | Subscription started | Subscribe action |
| `SUBSCRIPTION_CANCELLED` | Subscription cancelled | Unsubscribe action |
| `GIFT_SENT` | Gift sent | Gift sent to user |
| `PAYOUT_REQUESTED` | Payout requested | Payout submitted |
| `COPYRIGHT_REPORTED` | Copyright reported | Report filed |
| `ACCOUNT_CREATED` | Account created | Registration completed |
| `ACCOUNT_DEACTIVATED` | Account deactivated | Deactivation |
| `ACCOUNT_DELETED` | Account deleted | Deletion |
| `LOGIN` | User logged in | Login success |
| `LOGOUT` | User logged out | Logout |
| `PASSWORD_CHANGED` | Password changed | Password update |
| `EMAIL_VERIFIED` | Email verified | Email verification |
| `PHONE_VERIFIED` | Phone verified | Phone verification |
| `PROFILE_UPDATED` | Profile updated | Profile changes |
| `SETTINGS_CHANGED` | Settings changed | Settings update |
| `DATA_EXPORTED` | Data exported | Export completed |

### 12.2 Event Schema

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "event_type": "string",
  "content_type": "string | null",
  "content_id": "uuid | null",
  "metadata": {},
  "session_id": "string",
  "ip_address": "string",
  "user_agent": "string",
  "created_at": "timestamp"
}
```

---

## 13. Safety & Moderation

### 13.1 Spam Detection

```python
# Spam detection rules
SPAM_RULES = {
    "rate_limit": {
        "posts_per_hour": 10,
        "comments_per_minute": 5,
        "messages_per_minute": 20,
        "follows_per_hour": 50
    },
    "content_patterns": [
        r"(?i)(buy now|click here|free money|earn \$)",
        r"(?i)(crypto|bitcoin|investment opportunity)",
        r"(.)\1{10,}",  # Repeated characters
    ],
    "link_patterns": [
        r"http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+])+",
    ],
    "threshold": 0.85  # Spam score threshold
}
```

### 13.2 Bot Detection

```python
BOT_DETECTION = {
    "behavioral_signals": {
        "posting_frequency": "Too regular intervals",
        "engagement_pattern": "Likes everything instantly",
        "content_quality": "Low quality or duplicate content",
        "profile_completeness": "Incomplete profile",
        "follower_ratio": "Unusual follow/follower ratio"
    },
    "technical_signals": {
        "user_agent": "Known bot user agents",
        "ip_reputation": "Known bot IPs",
        "device_fingerprint": "Emulator detection",
        "captcha_score": "Low captcha confidence"
    },
    "threshold": 0.75
}
```

### 13.3 Fake Account Detection

```python
FAKE_ACCOUNT_DETECTION = {
    "signals": {
        "profile_photo": "No photo or stolen photo",
        "bio": "Empty or generic",
        "username": "Random characters pattern",
        "posting_behavior": "Immediate mass following",
        "engagement_authenticity": "Generic comments only",
        "account_age": "Very new account"
    },
    "verification_methods": [
        "phone_verification",
        "email_verification",
        "photo_verification",
        "id_verification"
    ]
}
```

### 13.4 Rate Limiting

```python
RATE_LIMITS = {
    "global": {
        "requests_per_minute": 100,
        "requests_per_hour": 1000
    },
    "auth": {
        "login_attempts_per_minute": 5,
        "login_attempts_per_hour": 20,
        "password_reset_per_hour": 3
    },
    "content": {
        "posts_per_hour": 10,
        "reels_per_hour": 5,
        "stories_per_hour": 20,
        "comments_per_minute": 5,
        "messages_per_minute": 20
    },
    "interactions": {
        "likes_per_minute": 30,
        "follows_per_hour": 50,
        "saves_per_minute": 20
    },
    "api": {
        "search_per_minute": 10,
        "profile_views_per_minute": 30
    }
}
```

### 13.5 Moderation Queue

```sql
-- Moderation queue for human reviewers
CREATE TABLE moderation_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type    VARCHAR(20) NOT NULL,
    content_id      UUID NOT NULL,
    report_count    INT DEFAULT 1,
    priority        INT DEFAULT 0, -- Higher = more urgent
    status          VARCHAR(20) DEFAULT 'pending', -- pending, in_review, resolved
    assigned_to     UUID REFERENCES users(id),
    resolution      VARCHAR(50),
    resolution_note TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at     TIMESTAMP WITH TIME ZONE
);
```

---

## 14. Monetization System

### 14.1 Revenue Streams

| Stream | Description | Platform Fee |
|--------|-------------|-------------|
| `subscriptions` | Monthly creator subscriptions | 10% |
| `gifts` | Virtual gifts in LIVE | 30% |
| `badges` | Badges in comments/DM | 20% |
| `exclusive_content` | Paid posts/stories | 15% |
| `ads` | Ad revenue share | 50% |
| `shop` | Product sales commission | 5% |

### 14.2 Wallet Flow

```
User Action → Wallet Credit → Pending Balance (7 days) → Available Balance → Payout
```

### 14.3 Payout Schedule

| Threshold | Schedule | Method |
|-----------|----------|--------|
| $10+ | Weekly (Monday) | Bank Transfer |
| $50+ | Weekly (Monday) | PayPal |
| $100+ | On-demand | Bank Transfer |

---

## 15. Shopping / Business

### 15.1 Business Account Features

- Product catalog management
- Product tagging in posts/reels
- Shop page on profile
- Order management
- Inventory tracking
- Sales analytics
- Coupon creation
- Customer management

### 15.2 Order Flow

```
Browse → Product Page → Add to Cart → Checkout → Payment → Order Confirmed
                                                    ↓
                                            Seller Notification
                                                    ↓
                                            Ship → Delivered → Review
```

---

## 16. Copyright System

### 16.1 Copyright Report Flow

```
Report Filed → Review Queue → Content Check → Decision
                                            ├── Accept → Takedown + Strike
                                            ├── Reject → Notify Reporter
                                            └── Appeal → Appeal Review → Final Decision
```

### 16.2 Repeat Infringer Policy

| Strike | Action |
|--------|--------|
| 1st | Warning + content removal |
| 2nd | 7-day posting restriction |
| 3rd | 30-day account suspension |
| 4th | Permanent ban |

---

## 17. Multi-language / i18n

### 17.1 Supported Languages

| Code | Language | Status |
|------|----------|--------|
| `en` | English | ✅ |
| `hi` | Hindi | ✅ |
| `hing` | Hinglish | ✅ |
| `es` | Spanish | 🔜 |
| `fr` | French | 🔜 |
| `de` | German | 🔜 |
| `pt` | Portuguese | 🔜 |
| `ar` | Arabic | 🔜 |
| `bn` | Bengali | 🔜 |
| `ta` | Tamil | 🔜 |
| `te` | Telugu | 🔜 |
| `mr` | Marathi | 🔜 |
| `gu` | Gujarati | 🔜 |
| `kn` | Kannada | 🔜 |
| `ml` | Malayalam | 🔜 |
| `pa` | Punjabi | 🔜 |

### 17.2 Translation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 TRANSLATION PIPELINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. DETECT LANGUAGE                                         │
│     └── User input → Language detection                     │
│                                                             │
│  2. CHECK CACHE                                             │
│     └── Redis cache → Return if exists                      │
│                                                             │
│  3. TRANSLATE                                               │
│     └── Google Translate / DeepL API                        │
│                                                             │
│  4. STORE                                                   │
│     └── Save to translations table                          │
│                                                             │
│  5. RETURN                                                  │
│     └── Translated content to client                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 17.3 Translation API

```sql
CREATE TABLE translations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_text     TEXT NOT NULL,
    source_language VARCHAR(10) NOT NULL,
    target_language VARCHAR(10) NOT NULL,
    translated_text TEXT NOT NULL,
    content_type    VARCHAR(20), -- caption, comment, bio, etc.
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_text, source_language, target_language)
);
```

---

## 18. Data Management

### 18.1 Data Export

```json
POST /api/v1/data/export

{
  "status": "processing",
  "estimated_completion": "2026-10-06T14:00:00Z",
  "data_includes": [
    "profile",
    "posts",
    "reels",
    "stories",
    "comments",
    "messages",
    "followers",
    "following",
    "settings",
    "analytics"
  ]
}
```

### 18.2 Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Deleted content | 30 days |
| Deactivated accounts | 90 days |
| Event logs | 1 year |
| Audit logs | 7 years |
| Messages | Until deleted |
| Media files | Until account deletion |

---

## 19. System-Level Production Features

### 19.1 API Versioning

```
/api/v1/...  (current)
/api/v2/...  (future)
```

### 19.2 Health Checks

```json
GET /api/v1/health

{
  "status": "healthy",
  "timestamp": "2026-10-06T12:00:00Z",
  "services": {
    "api": { "status": "up", "latency_ms": 45 },
    "database": { "status": "up", "latency_ms": 12 },
    "redis": { "status": "up", "latency_ms": 3 },
    "elasticsearch": { "status": "up", "latency_ms": 25 },
    "storage": { "status": "up", "latency_ms": 15 },
    "queue": { "status": "up", "latency_ms": 8 }
  }
}
```

### 19.3 Monitoring & Alerting

| Metric | Threshold | Alert |
|--------|-----------|-------|
| API latency | > 500ms | Warning |
| API latency | > 1000ms | Critical |
| Error rate | > 1% | Warning |
| Error rate | > 5% | Critical |
| CPU usage | > 80% | Warning |
| CPU usage | > 95% | Critical |
| Memory usage | > 85% | Warning |
| Disk usage | > 90% | Critical |
| DB connections | > 80% | Warning |
| Queue depth | > 1000 | Warning |

### 19.4 Backup Strategy

| Data | Frequency | Retention |
|------|-----------|-----------|
| PostgreSQL | Daily full + WAL | 30 days |
| Redis | Every 6 hours | 7 days |
| Media files | Real-time replication | Forever |
| Elasticsearch | Daily snapshot | 14 days |

### 19.5 Disaster Recovery

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single service failure | 5 min | 0 |
| Database failure | 30 min | 5 min |
| Full region failure | 4 hours | 1 hour |

---

## 20. Admin Panel

### 20.1 Admin Roles

| Role | Permissions |
|------|-------------|
| `support_agent` | View user profiles, handle reports |
| `moderator` | Moderate content, manage reports |
| `admin` | Manage users, feature flags, view analytics |
| `super_admin` | Full system access, configuration |

### 20.2 Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/users` | List all users |
| `GET` | `/admin/users/:id` | Get user details |
| `POST` | `/admin/users/:id/suspend` | Suspend user |
| `POST` | `/admin/users/:id/unsuspend` | Unsuspend user |
| `POST` | `/admin/users/:id/verify` | Verify user |
| `POST` | `/admin/users/:id/delete` | Delete user |
| `GET` | `/admin/reports` | Get all reports |
| `POST` | `/admin/reports/:id/resolve` | Resolve report |
| `GET` | `/admin/moderation-queue` | Get moderation queue |
| `POST` | `/admin/moderation-queue/:id/assign` | Assign to moderator |
| `GET` | `/admin/analytics` | Platform analytics |
| `GET` | `/admin/feature-flags` | Get all feature flags |
| `PATCH` | `/admin/feature-flags/:key` | Update feature flag |
| `GET` | `/admin/audit-logs` | Get audit logs |
| `GET` | `/admin/copyright-reports` | Get copyright reports |
| `POST` | `/admin/copyright-reports/:id/resolve` | Resolve copyright report |
| `GET` | `/admin/payouts` | Get all payouts |
| `POST` | `/admin/payouts/:id/process` | Process payout |
| `GET` | `/admin/system/health` | System health |
| `GET` | `/admin/system/config` | System configuration |

---

## 21. Universal Sharing & Deep Links

### 21.1 Deep Link Format

```
https://domdom.com/{contentType}/{id}
https://domdom.com/u/{username}
https://domdom.com/p/{postId}
https://domdom.com/r/{reelId}
https://domdom.com/s/{storyId}
https://domdom.com/l/{locationId}
https://domdom.com/h/{hashtag}
https://domdom.com/a/{audioId}
https://domdom.com/e/{productId}
```

### 21.2 App Links (Universal Links)

```
iOS:     https://domdom.com/.well-known/apple-app-site-association
Android: https://domdom.com/.well-known/assetlinks.json
```

### 21.3 Share Response

```json
GET /api/v1/share/post/{postId}

{
  "post_id": "uuid",
  "share_links": {
    "web": "https://domdom.com/p/{postId}",
    "app": "domdom://post/{postId}",
    "whatsapp": "https://wa.me/?text=...",
    "telegram": "https://t.me/share/url?url=...",
    "facebook": "https://www.facebook.com/sharer/sharer.php?u=...",
    "twitter": "https://twitter.com/intent/tweet?url=...",
    "copy": "https://domdom.com/p/{postId}"
  },
  "qr_code": "https://api.domdom.com/qr/post/{postId}.png"
}
```

---

## 22. API Versioning

### 22.1 Version Strategy

- **URL Path Versioning:** `/api/v1/`, `/api/v2/`
- **Deprecation Policy:** 12 months notice before deprecation
- **Sunset Header:** `Sunset: Sat, 01 Jan 2027 00:00:00 GMT`

### 22.2 Version Lifecycle

```
Draft → Beta → Stable → Deprecated → Sunset → Removed
```

---

## Appendix A: Environment Variables

```env
# Server
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/domdom
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# Storage
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_BUCKET=domdom-media
STORAGE_REGION=us-east-1

# CDN
CDN_URL=https://cdn.domdom.com

# JWT
JWT_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Push Notifications
FCM_SERVER_KEY=
APNS_CERT_PATH=
APNS_KEY_PATH=

# Payment
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Monitoring
SENTRY_DSN=
PROMETHEUS_PORT=9090

# Feature Flags
FEATURE_LIVE=true
FEATURE_GIFTS=false
```

---

## Appendix B: Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_001` | 401 | Invalid credentials |
| `AUTH_002` | 401 | Token expired |
| `AUTH_003` | 403 | Insufficient permissions |
| `AUTH_004` | 403 | Account suspended |
| `USER_001` | 404 | User not found |
| `USER_002` | 409 | Username already taken |
| `USER_003` | 409 | Email already registered |
| `CONTENT_001` | 404 | Content not found |
| `CONTENT_002` | 403 | Content not accessible |
| `CONTENT_003` | 410 | Content deleted |
| `CONTENT_004` | 403 | Content archived |
| `RATE_001` | 429 | Rate limit exceeded |
| `RATE_002` | 429 | Too many requests |
| `SPAM_001` | 403 | Content flagged as spam |
| `SPAM_002` | 403 | Account flagged as spam |
| `COPYRIGHT_001` | 403 | Content under copyright claim |
| `COPYRIGHT_002` | 403 | Audio copyright restricted |
| `SHOP_001` | 400 | Product out of stock |
| `SHOP_002` | 400 | Invalid coupon |
| `PAYMENT_001` | 400 | Payment failed |
| `PAYMENT_002` | 400 | Insufficient balance |
| `SYSTEM_001` | 500 | Internal server error |
| `SYSTEM_002` | 503 | Service unavailable |
| `SYSTEM_003` | 503 | Maintenance mode |

---

## Appendix C: Glossary

| Term | Definition |
|------|-----------|
| **For You** | Personalized feed based on user behavior |
| **Explore** | Discovery feed with trending content |
| **Close Friends** | Private friend list for exclusive content |
| **Remix** | Create a new reel alongside an original |
| **Repost** | Share someone else's content to your feed |
| **Collab** | Co-authored post/reel with another user |
| **Note** | 24-hour status update |
| **Highlight** | Saved stories on profile |
| **Deep Link** | URL that opens specific content in app |
| **Feature Flag** | Runtime configuration toggle |

---

**End of Specification**

> This document is the single source of truth for DOMDOM backend development. All teams should reference this specification for implementation details.
