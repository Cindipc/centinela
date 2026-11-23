package com.centinela.ai.controller;

import com.centinela.ai.model.ClassificationResponse;
import com.centinela.ai.model.ClassifyRequest;
import com.centinela.ai.model.TrainRequest;
import com.centinela.ai.model.TrainResponse;
import com.centinela.ai.service.ModelService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class AiController {

    private final ModelService modelService;

    public AiController(ModelService modelService) {
        this.modelService = modelService;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return modelService.health();
    }

    @PostMapping("/ai/classify")
    public ClassificationResponse classify(@RequestBody ClassifyRequest request) {
        validate(request);
        return modelService.classify(
                request.type(),
                request.title(),
                request.description(),
                request.createdAt()
        );
    }

    @PostMapping("/ai/prioritize")
    public ClassificationResponse prioritize(@RequestBody ClassifyRequest request) {
        validate(request);
        return modelService.classify(
                request.type(),
                request.title(),
                request.description(),
                request.createdAt()
        );
    }

    @PostMapping("/ai/train")
    public TrainResponse train(@RequestBody(required = false) TrainRequest request) {
        return modelService.train(request == null ? null : request.incidents());
    }

    private void validate(ClassifyRequest request) {
        if (request == null || request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("El título del reporte es obligatorio.");
        }
    }
}
