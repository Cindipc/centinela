package com.centinela.ai.model;

public record ClassifyRequest(
        String id,
        String type,
        String title,
        String description,
        String zone,
        String zoneId,
        Double latitude,
        Double longitude,
        String createdAt
) {
}
