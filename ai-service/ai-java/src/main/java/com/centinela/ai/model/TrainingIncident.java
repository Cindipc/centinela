package com.centinela.ai.model;

public record TrainingIncident(
        String type,
        String priority,
        String title,
        String description,
        String zone,
        String createdAt,
        Boolean isSynthetic
) {
}
