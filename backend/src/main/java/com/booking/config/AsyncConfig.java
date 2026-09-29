package com.booking.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.cache.annotation.EnableCaching;

@Configuration
@EnableAsync
@EnableScheduling
@EnableCaching
public class AsyncConfig {
}
