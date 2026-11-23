package com.centinela.ai.model;

import java.util.List;

public record TrainRequest(
        List<TrainingIncident> incidents,
        Integer days
) {
}
